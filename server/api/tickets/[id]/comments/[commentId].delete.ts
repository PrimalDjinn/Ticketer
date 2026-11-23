import { eq, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id, commentId } = await getValidatedRouterParams(event, commentParams.parse)
  const ticket = await loadTicketFor(user, id)
  const comment = await db.query.comments.findFirst({ where: eq(schema.comments.id, commentId) })
  if (!comment || comment.ticketId !== id) throw createError({ status: 404, message: 'Comment not found' })
  if (comment.authorId !== user.id && !user.isAdmin) throw createError({ status: 403, message: 'You can only delete your own comments' })

  // Collect the whole reply thread so its files can be removed from storage after the rows cascade away.
  const all = await db.select({ id: schema.comments.id, parentId: schema.comments.parentId }).from(schema.comments).where(eq(schema.comments.ticketId, id))
  const thread = new Set([commentId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of all) if (c.parentId && thread.has(c.parentId) && !thread.has(c.id)) (thread.add(c.id), (grew = true))
  }
  const files = await db
    .select({ pathname: schema.attachments.pathname })
    .from(schema.attachments)
    .where(inArray(schema.attachments.commentId, [...thread]))

  await db.delete(schema.comments).where(eq(schema.comments.id, commentId))
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))
  for (const removed of thread) publish(event, ticketAudience(ticket), { type: 'comment.deleted', body: { id: removed, ticketId: id } })
  return { ok: true }
})
