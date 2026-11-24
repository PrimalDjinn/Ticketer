import type { H3Event } from 'h3'
import { and, eq, inArray, isNotNull, ne, or, sql, type SQL } from 'drizzle-orm'
import { db, schema } from 'hub:db'

const log = useLogger('privacy')

/**
 * What happens to tickets the person opened:
 *  - keep: they stay for the team's records; the reporter shows as "Deleted user".
 *  - delete-private: their private tickets are deleted; public issues stay (anonymised). Offered to people deleting
 *    their own account, since public issues are also the team's announcements.
 *  - delete: every ticket they opened is deleted. Admins and apps only.
 */
export type TicketDeletion = (typeof ACCOUNT_TICKET_MODES)[number]

export interface DeleteAccountOptions {
  tickets: TicketDeletion
  via: 'self' | 'admin' | 'app'
  /** Admin user id or integration app id. */
  actorId: string | null
}

export type DeletionSummary = Record<'tickets' | 'ticketsKept' | 'comments' | 'conversations' | 'directMessages' | 'files', number>

/** People who cannot be deleted right now, with the reason. */
export async function deletionBlocker(user: { id: string; role: UserRole; isGuest: boolean }) {
  if (user.role === 'admin' && !user.isGuest) {
    const other = await db.query.users.findFirst({
      where: and(eq(schema.users.role, 'admin'), eq(schema.users.isGuest, false), ne(schema.users.id, user.id)),
      columns: { id: true },
    })
    if (!other) return 'This is the only admin. Make someone else an admin first.'
  }
  return null
}

/**
 * Erases a person: their account and everything that is only about them. Tickets follow `options.tickets`; replies they
 * left on tickets that stay are kept but blanked when tickets are deleted, so other people's replies under them survive.
 * Team records (tasks, task comments, project history) stay with "Deleted user" as the author.
 *
 * Runs without a transaction (D1 has none); every step is idempotent, so a retry after a failure finishes the job.
 * Stored files are removed after the rows that point to them.
 */
export async function deleteAccount(event: H3Event, userId: string, options: DeleteAccountOptions): Promise<DeletionSummary> {
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, userId) })
  if (!user) throw createError({ status: 404, message: 'Account not found' })
  const blocker = await deletionBlocker(user)
  if (blocker) throw createError({ status: 409, message: blocker })

  const a = schema.attachments
  const files: string[] = []
  // Attachment rows are removed explicitly (see takeAttachments); their files go once everything else is done.
  const collect = async (where: SQL | undefined) => files.push(...(await takeAttachments(where)))
  const summary: DeletionSummary = { tickets: 0, ticketsKept: 0, comments: 0, conversations: 0, directMessages: 0, files: 0 }

  // --- Tickets they opened -----------------------------------------------------------------------------------------
  const opened = await db
    .select({ id: schema.tickets.id, visibility: schema.tickets.visibility })
    .from(schema.tickets)
    .where(eq(schema.tickets.creatorId, userId))
  const doomed = opened.filter((t) => options.tickets === 'delete' || (options.tickets === 'delete-private' && t.visibility === 'private')).map((t) => t.id)
  summary.ticketsKept = opened.length - doomed.length
  if (doomed.length) {
    const commentIds = (await db.select({ id: schema.comments.id }).from(schema.comments).where(inArray(schema.comments.ticketId, doomed))).map((c) => c.id)
    await collect(or(inArray(a.ticketId, doomed), commentIds.length ? inArray(a.commentId, commentIds) : undefined))
    await db.delete(schema.tickets).where(inArray(schema.tickets.id, doomed)) // comments, followers and file rows cascade
    summary.tickets = doomed.length
    for (const id of doomed) publish(event, channels.members, { type: 'ticket.deleted', body: { id } })
  }

  // --- Their replies on tickets that stay ----------------------------------------------------------------------------
  // When the person asked for their tickets to go, their words elsewhere go too: the reply stays as an empty
  // placeholder (so threads keep their shape) and its files are removed.
  if (options.tickets !== 'keep') {
    const replies = (await db.select({ id: schema.comments.id }).from(schema.comments).where(eq(schema.comments.authorId, userId))).map((c) => c.id)
    if (replies.length) {
      await collect(inArray(a.commentId, replies))
      await db.update(schema.comments).set({ body: '' }).where(inArray(schema.comments.id, replies))
      summary.comments = replies.length
    }
  }

  // --- Support conversations they started (always: they are about this person) -------------------------------------
  const conversations = (
    await db.select({ id: schema.conversations.id }).from(schema.conversations).where(eq(schema.conversations.customerId, userId))
  ).map((c) => c.id)
  if (conversations.length) {
    const messages = (
      await db
        .select({ id: schema.conversationMessages.id })
        .from(schema.conversationMessages)
        .where(inArray(schema.conversationMessages.conversationId, conversations))
    ).map((m) => m.id)
    if (messages.length) await collect(inArray(a.conversationMessageId, messages))
    await db.delete(schema.conversations).where(inArray(schema.conversations.id, conversations)) // messages, reads, file rows cascade
    summary.conversations = conversations.length
  }
  // Files they sent in other conversations (as a teammate) stay with the conversation, like their messages.

  // --- Direct messages (both sides of every DM thread they were in) ------------------------------------------------
  const chats = (
    await db
      .select({ id: schema.chats.id })
      .from(schema.chats)
      .where(or(eq(schema.chats.userA, userId), eq(schema.chats.userB, userId)))
  ).map((c) => c.id)
  if (chats.length) {
    const messages = (await db.select({ id: schema.messages.id }).from(schema.messages).where(inArray(schema.messages.chatId, chats))).map((m) => m.id)
    if (messages.length) await collect(inArray(a.messageId, messages))
    summary.directMessages = messages.length
    await db.delete(schema.chats).where(inArray(schema.chats.id, chats)) // messages and file rows cascade
  }

  // --- Everything else keyed to the account ------------------------------------------------------------------------
  if (user.email) await db.delete(schema.invites).where(eq(schema.invites.email, user.email))
  await db.delete(schema.userIdentities).where(eq(schema.userIdentities.userId, userId))
  await db.delete(schema.loginLinks).where(eq(schema.loginLinks.userId, userId))
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, userId))
  await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, userId))
  await db.delete(schema.notifications).where(eq(schema.notifications.userId, userId))
  await db.delete(schema.ticketWatchers).where(eq(schema.ticketWatchers.userId, userId))
  await db.delete(schema.conversationReads).where(eq(schema.conversationReads.userId, userId))
  // Their name inside other people's records: notification texts ("dana opened a ticket") and task history
  // ("assigned to dana"). Replaced as a whole word only, so other words that contain it are left alone.
  if (user.name) await scrubName(user.name)

  // tickets.assignee_id was added by ALTER TABLE, so older databases lack its ON DELETE SET NULL: clear it here.
  await db.update(schema.tickets).set({ assigneeId: null }).where(eq(schema.tickets.assigneeId, userId))
  // Remaining references (kept tickets, replies, tasks, uploads on kept records) become "Deleted user" via set null.
  await db.delete(schema.users).where(eq(schema.users.id, userId))

  summary.files = files.length
  await db.insert(schema.accountDeletions).values({
    userId,
    role: user.isGuest ? 'guest' : user.role,
    via: options.via,
    // Self-deletion has no other actor; don't keep the account's id twice.
    actorId: options.via === 'self' ? null : options.actorId,
    tickets: options.tickets,
    summary,
  })
  event.waitUntil(deleteBlobs(files))
  log.info('account deleted', { userId, via: options.via, actorId: options.actorId, ticketMode: options.tickets, ...summary })
  return summary
}

/** What a deletion would remove, so people can see it before confirming. */
export async function deletionPreview(userId: string) {
  const [tickets, conversations, chats] = await Promise.all([
    db
      .select({ visibility: schema.tickets.visibility, n: sql<number>`count(*)` })
      .from(schema.tickets)
      .where(eq(schema.tickets.creatorId, userId))
      .groupBy(schema.tickets.visibility),
    db.select({ n: sql<number>`count(*)` }).from(schema.conversations).where(eq(schema.conversations.customerId, userId)),
    db
      .select({ n: sql<number>`count(*)` })
      .from(schema.chats)
      .where(and(or(eq(schema.chats.userA, userId), eq(schema.chats.userB, userId)), isNotNull(schema.chats.lastMessageAt))),
  ])
  const count = (visibility: TicketVisibility) => Number(tickets.find((t) => t.visibility === visibility)?.n ?? 0)
  return {
    privateTickets: count('private'),
    publicTickets: count('public'),
    conversations: Number(conversations[0]?.n ?? 0),
    directChats: Number(chats[0]?.n ?? 0),
  }
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Replaces a deleted person's username with "Deleted user" in notification texts and task history values. */
async function scrubName(name: string) {
  const word = new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRegExp(name)}(?![\\p{L}\\p{N}_])`, 'gu')
  const like = `%${name.replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const notes = await db
    .select({ id: schema.notifications.id, message: schema.notifications.message })
    .from(schema.notifications)
    .where(sql`${schema.notifications.message} LIKE ${like} ESCAPE '\\'`)
  for (const note of notes) {
    const message = note.message.replace(word, 'Deleted user')
    if (message !== note.message) await db.update(schema.notifications).set({ message }).where(eq(schema.notifications.id, note.id))
  }
  // Task history stores names as whole values (e.g. the assignee before and after a change).
  await db.update(schema.taskActivity).set({ fromValue: 'Deleted user' }).where(eq(schema.taskActivity.fromValue, name))
  await db.update(schema.taskActivity).set({ toValue: 'Deleted user' }).where(eq(schema.taskActivity.toValue, name))
}
