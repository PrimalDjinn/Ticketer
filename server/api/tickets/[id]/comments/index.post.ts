import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  body: z.string().trim().max(10_000).default(''),
  parentId: z.coerce.number().int().positive().optional(),
  mentions: z.array(z.string().max(64)).max(50).default([]),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const ticket = await loadTicketFor(user, id)
  const { files, text, form } = await readMultipart(event)
  const input = fields.parse({ body: text('body'), parentId: text('parentId') || undefined, mentions: form.getAll('mentions') })

  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a comment or attach a document' })
  if (input.parentId) {
    const parent = await db.query.comments.findFirst({
      where: and(eq(schema.comments.id, input.parentId), eq(schema.comments.ticketId, id)),
      columns: { id: true },
    })
    if (!parent) throw createError({ status: 400, message: 'The comment you replied to no longer exists' })
  }

  const [comment] = await db
    .insert(schema.comments)
    .values({ ticketId: id, parentId: input.parentId ?? null, authorId: user.id, body: input.body })
    .returning()
  try {
    await storeAttachments(`tickets/${ticket.reference}/comments/${comment!.id}`, files, { commentId: comment!.id }, user.id)
  } catch (error) {
    await db.delete(schema.comments).where(eq(schema.comments.id, comment!.id))
    throw error
  }

  // Replies move work along: staff picking up a new ticket, or the reporter answering a closed one, makes it Pending.
  const reopen = (user.isAdmin && ticket.status === 'Open') || (ticket.creatorId === user.id && (ticket.status === 'Resolved' || ticket.status === 'Closed'))
  if (reopen) {
    const [updated] = await db
      .update(schema.tickets)
      .set({ status: 'Pending', updatedAt: new Date(), resolvedAt: null })
      .where(eq(schema.tickets.id, id))
      .returning()
    broadcastTicket(event, updated!, 'ticket.updated')
  }

  const [dto] = await toCommentDTOs([comment!])
  publish(event, ticketAudience(ticket), { type: 'comment.created', body: dto! })

  // Mentions may only reach people who can see the ticket: admins and the reporter.
  const allowed = new Set([...(await adminIds()), ...(ticket.creatorId ? [ticket.creatorId] : [])])
  const mentioned = input.mentions.filter((uid) => allowed.has(uid) && uid !== user.id)
  const link = `/tickets/${id}#comment-${comment!.id}`
  await notify(event, mentioned, { type: 'mention', message: `${user.name} mentioned you on ticket ${ticket.reference.slice(-8)}`, link })
  if (ticket.creatorId && ticket.creatorId !== user.id && !mentioned.includes(ticket.creatorId)) {
    await notify(event, ticket.creatorId, { type: 'comment', message: `${user.name} commented on your ticket`, link })
  }
  return dto
})
