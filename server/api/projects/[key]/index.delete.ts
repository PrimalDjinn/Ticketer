import { eq, inArray, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { key } = await getValidatedRouterParams(event, projectKeyParams.parse)
  const project = await loadProject(key)

  const taskIds = (await db.select({ id: schema.tasks.id }).from(schema.tasks).where(eq(schema.tasks.projectId, project.id))).map((t) => t.id)
  const commentIds = taskIds.length
    ? (await db.select({ id: schema.taskComments.id }).from(schema.taskComments).where(inArray(schema.taskComments.taskId, taskIds))).map((c) => c.id)
    : []
  const files =
    taskIds.length || commentIds.length
      ? await db
          .select({ pathname: schema.attachments.pathname })
          .from(schema.attachments)
          .where(
            or(
              taskIds.length ? inArray(schema.attachments.taskId, taskIds) : undefined,
              commentIds.length ? inArray(schema.attachments.taskCommentId, commentIds) : undefined,
            ),
          )
      : []

  // Tasks reference statuses without cascading, so remove them before the project (which cascades statuses).
  await db.delete(schema.tasks).where(eq(schema.tasks.projectId, project.id))
  await db.delete(schema.projects).where(eq(schema.projects.id, project.id))
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))
  publish(event, channels.members, { type: 'project.deleted', body: { id: project.id } })
  return { ok: true }
})
