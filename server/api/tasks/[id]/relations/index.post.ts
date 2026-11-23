import { and, eq, or } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  targetId: z.number().int().positive(),
  /** As seen from this task: it blocks the target, is blocked by it, or simply relates. */
  kind: z.enum(RELATION_KINDS),
})

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const { targetId, kind } = await readValidatedBody(event, body.parse)
  if (targetId === id) throw createError({ status: 400, message: 'A task cannot relate to itself' })
  const [task, target] = await Promise.all([loadTask(id), loadTask(targetId)])

  const existing = await db.query.taskRelations.findFirst({
    where: or(
      and(eq(schema.taskRelations.taskId, id), eq(schema.taskRelations.relatedTaskId, targetId)),
      and(eq(schema.taskRelations.taskId, targetId), eq(schema.taskRelations.relatedTaskId, id)),
    ),
  })
  if (existing) throw createError({ status: 409, message: 'These tasks are already linked' })

  // Stored directed: "taskId blocks relatedTaskId".
  const [from, to] = kind === 'blocked_by' ? [targetId, id] : [id, targetId]
  await db.insert(schema.taskRelations).values({ taskId: from, relatedTaskId: to, type: kind === 'relates' ? 'relates' : 'blocks' })

  const ref = async (t: typeof task) => `${(await db.query.projects.findFirst({ where: eq(schema.projects.id, t.projectId) }))!.key}-${t.number}`
  await recordActivity(id, user.id, [{ field: 'relation', to: `${kind.replace('_', ' ')} ${await ref(target)}` }])
  for (const changed of [id, targetId]) publishTask(event, { type: 'task.updated', body: await taskDTO(changed) })
  return relationsOf(id)
})
