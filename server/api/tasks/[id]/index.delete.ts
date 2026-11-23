import { eq, inArray, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const task = await loadTask(id)

  // The task, its subtasks, and their comments all go; collect every file first.
  const taskIds = [id, ...(await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.parentId, id))).map((t) => t.id)]
  const commentIds = (await db.select({ id: schema.taskComments.id }).from(schema.taskComments).where(inArray(schema.taskComments.taskId, taskIds))).map((c) => c.id)
  const files = await db
    .select({ pathname: schema.attachments.pathname })
    .from(schema.attachments)
    .where(or(inArray(schema.attachments.taskId, taskIds), commentIds.length ? inArray(schema.attachments.taskCommentId, commentIds) : undefined))

  await db.delete(schema.tasks).where(eq(schema.tasks.id, id))
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))
  for (const removed of taskIds) publishTask(event, { type: 'task.deleted', body: { id: removed, projectId: task.projectId } })
  return { ok: true }
})
