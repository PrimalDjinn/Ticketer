import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  body: z.string().trim().max(10_000).default(''),
  parentId: z.coerce.number().int().positive().optional(),
  mentions: z.array(z.string().max(64)).max(50).default([]),
  /** Internal note: only the team ever sees it. Staff only. */
  internal: z.stringbool().default(false),
})

export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const ticket = await loadTicketFor(user, id)
  if (!ticketAccess.reply(user, ticket)) {
    throw createError({ status: 403, message: isInternal(user) ? 'Viewers cannot reply on tickets' : 'You cannot reply on this ticket' })
  }
  const { files, text, form } = await readMultipart(event)
  const input = fields.parse({
    body: text('body'),
    parentId: text('parentId') || undefined,
    mentions: form.getAll('mentions'),
    internal: text('internal') || undefined,
  })
  const staff = ticketAccess.manage(user)
  if (input.internal && !staff) throw createError({ status: 403, message: 'Only the support team can write internal notes' })

  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a comment or attach a document' })
  let internal = input.internal
  if (input.parentId) {
    const thread = await db
      .select({ id: schema.comments.id, parentId: schema.comments.parentId, internal: schema.comments.internal })
      .from(schema.comments)
      .where(eq(schema.comments.ticketId, id))
    const parent = thread.find((c) => c.id === input.parentId)
    const parentHidden = !!parent && !visibleComments(thread).some((c) => c.id === parent.id)
    // People outside the team cannot see (or answer) internal notes; replies inside an internal thread stay internal.
    if (!parent || (parentHidden && !isInternal(user))) throw createError({ status: 400, message: 'The comment you replied to no longer exists' })
    if (parentHidden) internal = true
  }

  const [comment] = await db
    .insert(schema.comments)
    .values({ ticketId: id, parentId: input.parentId ?? null, authorId: user.id, body: input.body, internal })
    .returning()
  try {
    await storeAttachments(`tickets/${ticket.reference}/comments/${comment!.id}`, files, { commentId: comment!.id }, user.id)
  } catch (error) {
    await db.delete(schema.comments).where(eq(schema.comments.id, comment!.id))
    throw error
  }
  // Replying follows the ticket (guests only ever reply on their own tickets, which they already follow).
  await watchTicket(id, user.id)

  if (!internal) {
    // Replies move work along: staff picking up a new ticket, or the reporter answering a closed one, makes it Pending.
    const reopen = (staff && ticket.status === 'Open') || (ticket.creatorId === user.id && (ticket.status === 'Resolved' || ticket.status === 'Closed'))
    const [updated] = await db
      .update(schema.tickets)
      .set(reopen ? { status: 'Pending', updatedAt: new Date(), resolvedAt: null } : { updatedAt: new Date() })
      .where(eq(schema.tickets.id, id))
      .returning()
    await broadcastTicket(event, updated!, 'ticket.updated')
  }
  await broadcastComment(event, ticket, comment!)

  // Mentions only reach people who can read this comment: the team for internal notes; for public replies also the
  // reporter and followers who can see the ticket.
  const followers = await ticketFollowers(ticket)
  const readers = new Set(internal ? followers.internal : followers.all)
  const team = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.isGuest, false), inArray(schema.users.role, [...INTERNAL_ROLES])))
  for (const person of team) readers.add(person.id)
  if (!internal && ticket.creatorId) readers.add(ticket.creatorId)
  const mentioned = [...new Set(input.mentions)].filter((uid) => readers.has(uid) && uid !== user.id)

  const link = ticketLink(ticket, comment!.id)
  const title = quotedTitle(ticket)
  await notify(event, mentioned, {
    type: 'mention',
    message: internal ? `${user.name} mentioned you in an internal note on ${title}` : `${user.name} mentioned you on ${title}`,
    link,
  })
  const audience = (internal ? followers.internal : followers.all).filter((uid) => uid !== user.id && !mentioned.includes(uid))
  const verb = internal ? 'added an internal note on' : 'replied on'
  const yours = audience.filter((uid) => uid === ticket.creatorId)
  await notify(event, yours, { type: 'comment', message: `${user.name} ${verb} your ticket ${title}`, link })
  await notify(event, audience.filter((uid) => uid !== ticket.creatorId), { type: 'comment', message: `${user.name} ${verb} ${title}`, link })

  const [dto] = await toCommentDTOs([comment!], user)
  return dto
})
