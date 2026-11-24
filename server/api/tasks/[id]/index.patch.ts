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
  repeat: z.enum(TASK_REPEATS).nullable().optional(),
  repeatInterval: z.number().int().min(1).max(3650).nullable().optional(),
  /** Custom field values keyed by field id; null clears a value. */
  fields: z.record(z.string().regex(/^\d+$/), z.unknown()).optional(),
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

  let movedTo: { name: string; isDone: boolean } | null = null
  if (input.statusId !== undefined && input.statusId !== task.statusId) {
    const [from, to] = await Promise.all([
      db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, task.statusId) }),
      ensureStatusInProject(input.statusId, task.projectId),
    ])
    movedTo = to
    patch.statusId = to.id
    patch.completedAt = to.isDone ? (task.completedAt ?? new Date()) : null
    if (input.position === undefined) patch.position = await nextPosition(to.id)
    activity.push({ field: 'status', from: from?.name ?? null, to: to.name })
  }
  if (input.position !== undefined) patch.position = input.position

  let becameDone = false
  if (patch.statusId !== undefined) {
    const to = await db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, patch.statusId) })
    const from = await db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, task.statusId) })
    becameDone = !!to?.isDone && !from?.isDone
  }

  if (input.repeat !== undefined || input.repeatInterval !== undefined) {
    const repeat = input.repeat !== undefined ? input.repeat : task.repeat
    const interval = repeat === 'periodically' ? Math.max(1, input.repeatInterval ?? task.repeatInterval ?? 1) : null
    if (repeat !== task.repeat || interval !== task.repeatInterval) {
      patch.repeat = repeat
      patch.repeatInterval = interval
      const describe = (rule: typeof repeat, days: number | null) => (rule === 'periodically' ? `every ${days} days` : rule)
      activity.push({ field: 'repeat', from: describe(task.repeat, task.repeatInterval), to: describe(repeat, interval) })
    }
  }

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
  if (input.fields) {
    for (const name of await applyFieldValues(id, task.projectId, input.fields)) activity.push({ field: 'field', to: name })
  }
  await recordActivity(id, user.id, activity)

  if (becameDone) await spawnNextOccurrence(event, user, { ...task, ...patch } as typeof task)

  const dto = await taskDTO(id)
  publishTask(event, { type: 'task.updated', body: dto })

  const link = `/projects/${project!.key}/${dto.number}`
  if (newAssignee) await followTask(event, id, [newAssignee])
  if (newAssignee && newAssignee !== user.id) {
    await notify(event, newAssignee, { type: 'task', message: `${user.name} assigned you ${dto.ref}: ${dto.title}`, link })
  }
  // Followers hear about the changes that matter to them: a move to another column, and who now owns the task.
  const news: string[] = []
  if (movedTo) news.push(movedTo.isDone ? `completed ${dto.ref}` : `moved ${dto.ref} to ${movedTo.name}`)
  if (patch.assigneeId !== undefined) {
    const it = news.length ? 'it' : dto.ref
    const assignee = patch.assigneeId && (patch.assigneeId === user.id ? 'themselves' : (await namesFor([patch.assigneeId])).get(patch.assigneeId))
    news.push(assignee ? `assigned ${it} to ${assignee}` : `unassigned ${it}`)
  }
  if (news.length) {
    await notifyTaskFollowers(event, id, user.id, { type: 'task', message: `${user.name} ${news.join(' and ')}: ${dto.title}`, link }, [newAssignee])
  }
  return dto
})
