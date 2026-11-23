import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().max(20_000).optional(),
  statusId: z.number().int().positive().optional(),
  priority: z.enum(TASK_PRIORITIES).optional(),
  assigneeId: z.string().max(64).nullable().optional(),
  startDate: z.iso.date().nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
  labelIds: z.array(z.number().int().positive()).max(20).optional(),
  /** Board drops send the new column and a position between the neighbouring cards. */
  position: z.number().finite().optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireEditor(event)
  const { id } = await getValidatedRouterParams(event, taskParams.parse)
  const input = await readValidatedBody(event, body.parse)
  const task = await loadTask(id)
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) })

  const patch: Partial<typeof schema.tasks.$inferInsert> = { updatedAt: new Date() }
  const activity: { field: string; from?: string | null; to?: string | null }[] = []
  const change = <K extends 'title' | 'description' | 'priority' | 'startDate' | 'dueDate'>(field: K, value: (typeof input)[K]) => {
    if (value === undefined || value === task[field]) return
    patch[field] = value as never
    activity.push({ field, from: field === 'description' ? null : (task[field] as string | null), to: field === 'description' ? null : (value as string | null) })
  }
  change('title', input.title)
  change('description', input.description)
  change('priority', input.priority)
  change('startDate', input.startDate)
  change('dueDate', input.dueDate)

  if (input.statusId !== undefined && input.statusId !== task.statusId) {
    const [from, to] = await Promise.all([
      db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, task.statusId) }),
      ensureStatusInProject(input.statusId, task.projectId),
    ])
    patch.statusId = to.id
    patch.completedAt = to.isDone ? (task.completedAt ?? new Date()) : null
    if (input.position === undefined) patch.position = await nextPosition(to.id)
    activity.push({ field: 'status', from: from?.name ?? null, to: to.name })
  }
  if (input.position !== undefined) patch.position = input.position

  let newAssignee: string | null = null
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    await ensureAssignable(input.assigneeId)
    patch.assigneeId = input.assigneeId
    const names = await namesFor([task.assigneeId, input.assigneeId])
    activity.push({ field: 'assignee', from: task.assigneeId ? names.get(task.assigneeId) : null, to: input.assigneeId ? names.get(input.assigneeId) : null })
    newAssignee = input.assigneeId
  }

  await db.update(schema.tasks).set(patch).where(eq(schema.tasks.id, id))
  if (input.labelIds) {
    const before = (await db.select().from(schema.taskLabels).where(eq(schema.taskLabels.taskId, id))).map((l) => l.labelId).sort()
    const after = [...new Set(input.labelIds)].sort()
    if (before.join() !== after.join()) {
      await setTaskLabels(id, after)
      activity.push({ field: 'labels' })
    }
  }
  await recordActivity(id, user.id, activity)

  const dto = await taskDTO(id)
  publishTask(event, { type: 'task.updated', body: dto })
  if (newAssignee && newAssignee !== user.id) {
    await notify(event, newAssignee, { type: 'task', message: `${user.name} assigned you ${dto.ref}: ${dto.title}`, link: `/projects/${project!.key}/${dto.number}` })
  }
  return dto
})
