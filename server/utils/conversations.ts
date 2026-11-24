import type { H3Event } from 'h3'
import { and, count, eq, gt, inArray, isNull, max, ne, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

type ConversationRow = typeof schema.conversations.$inferSelect
type MessageRow = typeof schema.conversationMessages.$inferSelect
type Viewer = { id: string; role: UserRole; isGuest?: boolean }

/** Longest message body and subject we accept. */
export const CONVERSATION_LIMITS = { body: 10_000, subject: 200 } as const

/** Where a conversation lives in the app, for notification links. */
export function conversationLink(row: ConversationRow, forCustomer: boolean) {
  return forCustomer ? `/?chat=${row.id}` : `/conversations?c=${row.id}`
}

/** The customer sees only their own conversations; internal people see all of them. Others get a 404. */
export async function loadConversationFor(user: Viewer, id: number) {
  const row = await db.query.conversations.findFirst({ where: eq(schema.conversations.id, id) })
  if (!row) throw createError({ status: 404, message: 'Conversation not found' })
  if (row.customerId === user.id) return { row, asCustomer: true as const }
  const role = await currentRole(user.id)
  if (role && isInternal({ role })) return { row, asCustomer: false as const, role }
  throw createError({ status: 404, message: 'Conversation not found' })
}

/** Like `loadConversationFor`, but internal people must also be allowed to change things (viewers get a 403). */
export async function loadConversationToAct(user: Viewer, id: number) {
  const found = await loadConversationFor(user, id)
  if (!found.asCustomer && !isStaff({ role: found.role })) throw createError({ status: 403, message: 'Viewers cannot make changes' })
  return found
}

export async function toConversationMessageDTOs(rows: MessageRow[], customerIds: Map<number, string>): Promise<ConversationMessageDTO[]> {
  const [names, files] = await Promise.all([
    namesFor(rows.map((r) => r.authorId)),
    attachmentsFor('conversationMessageId', rows.map((r) => r.id)),
  ])
  return rows.map((m) => ({
    id: m.id,
    conversationId: m.conversationId,
    authorId: m.authorId,
    authorName: m.authorId ? (names.get(m.authorId) ?? 'Deleted user') : 'Support team',
    fromTeam: m.authorId !== customerIds.get(m.conversationId),
    internal: m.internal,
    body: m.body,
    createdAt: m.createdAt,
    attachments: files.get(m.id) ?? [],
  }))
}

/**
 * Messages from "the other side" the viewer has not read yet, per conversation. For the customer that is the team's
 * replies (never internal notes); for someone on the team it is the customer's messages.
 */
export async function unreadCounts(ids: number[], viewerId: string, asCustomer: boolean) {
  const map = new Map<number, number>()
  if (!ids.length) return map
  const m = schema.conversationMessages
  const c = schema.conversations
  const r = schema.conversationReads
  const side = asCustomer
    ? and(eq(m.internal, false), or(isNull(m.authorId), ne(m.authorId, c.customerId)))
    : eq(m.authorId, c.customerId)
  const rows = await db
    .select({ id: m.conversationId, n: count() })
    .from(m)
    .innerJoin(c, eq(c.id, m.conversationId))
    .leftJoin(r, and(eq(r.conversationId, m.conversationId), eq(r.userId, viewerId)))
    .where(and(inArray(m.conversationId, ids), side, or(isNull(r.readAt), gt(m.createdAt, r.readAt))))
    .groupBy(m.conversationId)
  for (const row of rows) map.set(row.id, row.n)
  return map
}

/** The newest message of each conversation the viewer may see. */
async function latestMessages(ids: number[], includeInternal: boolean) {
  const map = new Map<number, MessageRow>()
  if (!ids.length) return map
  const m = schema.conversationMessages
  const latest = await db
    .select({ id: max(m.id) })
    .from(m)
    .where(and(inArray(m.conversationId, ids), includeInternal ? undefined : eq(m.internal, false)))
    .groupBy(m.conversationId)
  const messageIds = latest.map((l) => l.id).filter((id): id is number => id != null)
  if (!messageIds.length) return map
  const rows = await db.select().from(m).where(inArray(m.id, messageIds))
  for (const row of rows) map.set(row.conversationId, row)
  return map
}

/**
 * Conversation list items for one viewer. `unread` is computed for `viewer` unless `withUnread` is false (broadcasts,
 * where every recipient keeps their own count).
 */
export async function toConversationDTOs(rows: ConversationRow[], viewer: { id: string; asCustomer: boolean } | null): Promise<ConversationDTO[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const asCustomer = viewer?.asCustomer ?? false
  const [people, latest, unread] = await Promise.all([
    db
      .select({ id: schema.users.id, name: schema.users.name, email: schema.users.email, isGuest: schema.users.isGuest })
      .from(schema.users)
      .where(inArray(schema.users.id, [...new Set(rows.flatMap((r) => [r.customerId, r.assigneeId]).filter((id): id is string => !!id))])),
    latestMessages(ids, !asCustomer),
    viewer ? unreadCounts(ids, viewer.id, asCustomer) : Promise.resolve(new Map<number, number>()),
  ])
  const byId = new Map(people.map((p) => [p.id, p]))
  const latestNames = await namesFor([...latest.values()].map((m) => m.authorId))

  return rows.map((r) => {
    const customer = byId.get(r.customerId)
    const assignee = r.assigneeId ? byId.get(r.assigneeId) : undefined
    const last = latest.get(r.id)
    return {
      id: r.id,
      status: r.status,
      subject: r.subject,
      customer: {
        id: r.customerId,
        name: displayName(customer ? { id: r.customerId, name: customer.name } : null),
        email: customer?.email ?? null,
        isGuest: customer?.isGuest ?? true,
      },
      assigneeId: r.assigneeId,
      assigneeName: assignee ? displayName({ id: assignee.id, name: assignee.name }) : null,
      ticketId: r.ticketId,
      createdAt: r.createdAt,
      lastMessageAt: r.lastMessageAt,
      closedAt: r.closedAt,
      preview: last
        ? {
            body: last.body || '(attachment)',
            fromTeam: last.authorId !== r.customerId,
            internal: last.internal,
            authorName: last.authorId ? (latestNames.get(last.authorId) ?? 'Deleted user') : 'Support team',
            createdAt: last.createdAt,
          }
        : null,
      unread: unread.get(r.id) ?? 0,
    }
  })
}

export async function conversationDetail(row: ConversationRow, viewer: { id: string; asCustomer: boolean }): Promise<ConversationDetailDTO> {
  const m = schema.conversationMessages
  const [[dto], messages, reads] = await Promise.all([
    toConversationDTOs([row], viewer),
    db
      .select()
      .from(m)
      .where(and(eq(m.conversationId, row.id), viewer.asCustomer ? eq(m.internal, false) : undefined))
      .orderBy(m.createdAt, m.id),
    db.select().from(schema.conversationReads).where(eq(schema.conversationReads.conversationId, row.id)),
  ])
  const customerRead = reads.find((r) => r.userId === row.customerId)?.readAt ?? null
  const teamReads = reads.filter((r) => r.userId !== row.customerId).map((r) => new Date(r.readAt).getTime())
  return {
    ...dto!,
    messages: await toConversationMessageDTOs(messages, new Map([[row.id, row.customerId]])),
    customerReadAt: customerRead,
    teamReadAt: teamReads.length ? new Date(Math.max(...teamReads)) : null,
  }
}

/** Records that `userId` has read the conversation up to `at` and tells the people who show "Seen". */
export async function markConversationRead(event: H3Event, row: ConversationRow, userId: string, at = new Date(), opts: { tellCustomer?: boolean } = {}) {
  await db
    .insert(schema.conversationReads)
    .values({ conversationId: row.id, userId, readAt: at })
    .onConflictDoUpdate({
      target: [schema.conversationReads.conversationId, schema.conversationReads.userId],
      set: { readAt: sql`max(${schema.conversationReads.readAt}, excluded.read_at)` },
    })
  const body = { conversationId: row.id, userId, readAt: at }
  const isCustomer = userId === row.customerId
  const targets = [channels.members]
  // The customer sees "Seen" when someone on the team reads; their own reads only matter to the team.
  if (isCustomer || opts.tellCustomer !== false) targets.push(channels.user(row.customerId))
  publish(event, [...new Set(targets)], { type: 'conversation.read', body })
}

/** Pushes the conversation to the team and to its customer (each with what they may see). */
export async function broadcastConversation(event: H3Event, row: ConversationRow) {
  const [team, customer] = await Promise.all([
    toConversationDTOs([row], null),
    toConversationDTOs([row], { id: row.customerId, asCustomer: true }),
  ])
  publish(event, channels.members, { type: 'conversation.updated', body: team[0]! })
  publish(event, channels.user(row.customerId), { type: 'conversation.updated', body: { ...customer[0]!, unread: 0 } })
}

/** Pushes a new message: internal notes only ever go to the team. */
export function broadcastConversationMessage(event: H3Event, row: ConversationRow, message: ConversationMessageDTO) {
  const targets = message.internal ? [channels.members] : [channels.members, channels.user(row.customerId)]
  publish(event, targets, { type: 'conversation.message', body: message })
}

/** Ids of admins and members (people who may answer support conversations). */
export async function staffIds() {
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.isGuest, false), inArray(schema.users.role, [...STAFF_ROLES])))
  return rows.map((r) => r.id)
}

/** Checks that `id` belongs to an admin or member; conversations can only be assigned to them. */
export async function assertStaff(id: string) {
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, id), columns: { role: true, isGuest: true } })
  if (!row || !isStaff(row)) throw createError({ status: 400, message: 'Conversations can only be assigned to admins and members' })
}

/** Inserts a message (with files) and bumps the conversation. Returns the DTO; the caller broadcasts. */
export async function addConversationMessage(
  row: ConversationRow,
  input: { authorId: string | null; body: string; internal: boolean; files: File[]; uploaderId: string; at?: Date },
) {
  const now = input.at ?? new Date()
  const [message] = await db
    .insert(schema.conversationMessages)
    .values({ conversationId: row.id, authorId: input.authorId, body: input.body, internal: input.internal, createdAt: now })
    .returning()
  try {
    await storeAttachments(`conversations/${row.id}`, input.files, { conversationMessageId: message!.id }, input.uploaderId)
  } catch (error) {
    await db.delete(schema.conversationMessages).where(eq(schema.conversationMessages.id, message!.id))
    throw error
  }
  const [dto] = await toConversationMessageDTOs([message!], new Map([[row.id, row.customerId]]))
  return { message: message!, dto: dto! }
}

/** First line of a text, trimmed for titles and notification messages. */
export function firstLine(text: string, max = 120) {
  const line = text.trim().split('\n')[0]?.trim() ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Multipart fields shared by "start a conversation" and "send a message". Empty bodies are allowed with files. */
export const conversationMessageBody = z
  .string()
  .trim()
  .max(CONVERSATION_LIMITS.body, `Keep messages under ${CONVERSATION_LIMITS.body.toLocaleString('en')} characters`)
  .default('')
export const conversationSubject = z
  .string()
  .trim()
  .max(CONVERSATION_LIMITS.subject, `Keep the subject under ${CONVERSATION_LIMITS.subject} characters`)
  .transform((v) => v || null)

/** The short ticket reference shown to people (same as the app's `shortRef`). */
export function shortTicketRef(reference: string) {
  return reference.slice(-8)
}
