import { eq, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const { id, commentId } = await getValidatedRouterParams(event, commentParams.parse)
  const ticket = await loadTicketFor(user, id)
  const all = await db
    .select({ id: schema.comments.id, parentId: schema.comments.parentId, internal: schema.comments.internal })
    .from(schema.comments)
    .where(eq(schema.comments.ticketId, id))
  const comment = all.find((c) => c.id === commentId)
  const visible = isInternal(user) ? all : visibleComments(all)
  if (!comment || !visible.some((c) => c.id === commentId)) throw createError({ status: 404, message: 'Comment not found' })
  const row = await db.query.comments.findFirst({ where: eq(schema.comments.id, commentId), columns: { authorId: true } })
  if (row?.authorId !== user.id && !user.isAdmin) throw createError({ status: 403, message: 'You can only delete your own comments' })

  // Collect the whole reply thread so its files can be removed from storage after the rows cascade away.
  const thread = commentThread(all, commentId)
  const files = await db
    .select({ pathname: schema.attachments.pathname })
    .from(schema.attachments)
    .where(inArray(schema.attachments.commentId, [...thread]))

  await db.delete(schema.comments).where(eq(schema.comments.id, commentId))
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))

  // Outside people only hear about comments they could see.
  const outsideVisible = new Set(visibleComments(all).map((c) => c.id))
  const outside = (await outsideAudience(ticket)).map(channels.user)
  for (const removed of thread) {
    publish(event, outsideVisible.has(removed) ? [channels.members, ...outside] : channels.members, {
      type: 'comment.deleted',
      body: { id: removed, ticketId: id },
    })
  }
  return { ok: true }
})

function commentThread(all: { id: number; parentId: number | null }[], rootId: number) {
  const thread = new Set([rootId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of all) if (c.parentId && thread.has(c.parentId) && !thread.has(c.id)) (thread.add(c.id), (grew = true))
  }
  return thread
}
