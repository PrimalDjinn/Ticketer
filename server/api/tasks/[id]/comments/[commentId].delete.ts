import { eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.coerce.number().int().positive(), commentId: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const { id, commentId } = await getValidatedRouterParams(event, params.parse)
  const comment = await db.query.taskComments.findFirst({ where: eq(schema.taskComments.id, commentId) })
  if (!comment || comment.taskId !== id) throw createError({ status: 404, message: 'Comment not found' })
  if (comment.authorId !== user.id && (await currentRole(user.id)) !== 'admin') {
    throw createError({ status: 403, message: 'You can only delete your own comments' })
  }

  const all = await db.select({ id: schema.taskComments.id, parentId: schema.taskComments.parentId }).from(schema.taskComments).where(eq(schema.taskComments.taskId, id))
  const thread = new Set([commentId])
  for (let grew = true; grew; ) {
    grew = false
    for (const c of all) if (c.parentId && thread.has(c.parentId) && !thread.has(c.id)) (thread.add(c.id), (grew = true))
  }
  const files = await db.select({ pathname: schema.attachments.pathname }).from(schema.attachments).where(inArray(schema.attachments.taskCommentId, [...thread]))
  await db.delete(schema.taskComments).where(eq(schema.taskComments.id, commentId))
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))
  for (const removed of thread) publishTask(event, { type: 'task.comment.deleted', body: { id: removed, taskId: id } })
  return { ok: true }
})
