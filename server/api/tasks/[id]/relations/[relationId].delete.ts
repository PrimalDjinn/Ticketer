import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.coerce.number().int().positive(), relationId: z.coerce.number().int().positive() })

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id, relationId } = await getValidatedRouterParams(event, params.parse)
  const [row] = await db
    .delete(schema.taskRelations)
    .where(and(eq(schema.taskRelations.id, relationId), or(eq(schema.taskRelations.taskId, id), eq(schema.taskRelations.relatedTaskId, id))))
    .returning()
  if (!row) throw createError({ status: 404, message: 'Link not found' })
  const other = row.taskId === id ? row.relatedTaskId : row.taskId
  const otherTask = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, other) })
  const otherProject = otherTask ? await db.query.projects.findFirst({ where: eq(schema.projects.id, otherTask.projectId) }) : undefined
  const kind = row.type === 'relates' ? 'related to' : row.taskId === id ? 'blocks' : 'blocked by'
  await recordActivity(id, user.id, [{ field: 'relation', from: otherTask && otherProject ? `${kind} ${otherProject.key}-${otherTask.number}` : 'link removed' }])
  for (const changed of [id, other]) publishTask(event, { type: 'task.updated', body: await taskDTO(changed) })
  return relationsOf(id)
})
