import type { H3Event } from 'h3'
import { and, asc, count, desc, eq, inArray, isNull, max, or, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

type ProjectRow = typeof schema.projects.$inferSelect
type TaskRow = typeof schema.tasks.$inferSelect

export const projectKeyParams = z.object({ key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/) })
export const projectTaskParams = projectKeyParams.extend({ number: z.coerce.number().int().positive() })
export const taskParams = z.object({ id: z.coerce.number().int().positive() })

export function toStatusDTO(s: typeof schema.projectStatuses.$inferSelect): StatusDTO {
  return { id: s.id, projectId: s.projectId, name: s.name, color: s.color, position: s.position, isDone: s.isDone }
}

export async function statusesOf(projectIds: number[]) {
  const map = new Map<number, StatusDTO[]>()
  if (!projectIds.length) return map
  const rows = await db
    .select()
    .from(schema.projectStatuses)
    .where(inArray(schema.projectStatuses.projectId, projectIds))
    .orderBy(asc(schema.projectStatuses.position), asc(schema.projectStatuses.id))
  for (const row of rows) map.set(row.projectId, [...(map.get(row.projectId) ?? []), toStatusDTO(row)])
  return map
}

export function toFieldDTO(f: typeof schema.projectFields.$inferSelect): FieldDTO {
  return { id: f.id, projectId: f.projectId, name: f.name, type: f.type, options: f.options ?? [], required: f.required, position: f.position }
}

export async function fieldsOf(projectIds: number[]) {
  const map = new Map<number, FieldDTO[]>()
  if (!projectIds.length) return map
  const rows = await db
    .select()
    .from(schema.projectFields)
    .where(inArray(schema.projectFields.projectId, projectIds))
    .orderBy(asc(schema.projectFields.position), asc(schema.projectFields.id))
  for (const row of rows) map.set(row.projectId, [...(map.get(row.projectId) ?? []), toFieldDTO(row)])
  return map
}

export async function toProjectDTOs(rows: ProjectRow[]): Promise<ProjectDTO[]> {
  const ids = rows.map((r) => r.id)
  const [statuses, fields] = await Promise.all([statusesOf(ids), fieldsOf(ids)])
  const counts = ids.length
    ? await db
        .select({ projectId: schema.tasks.projectId, done: schema.projectStatuses.isDone, value: count() })
        .from(schema.tasks)
        .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
        .where(and(inArray(schema.tasks.projectId, ids), isNull(schema.tasks.parentId)))
        .groupBy(schema.tasks.projectId, schema.projectStatuses.isDone)
    : []
  return rows.map((p) => {
    const mine = counts.filter((c) => c.projectId === p.id)
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      description: p.description,
      color: p.color,
      archivedAt: p.archivedAt,
      createdAt: p.createdAt,
      statuses: statuses.get(p.id) ?? [],
      fields: fields.get(p.id) ?? [],
      openCount: mine.filter((c) => !c.done).reduce((n, c) => n + c.value, 0),
      taskCount: mine.reduce((n, c) => n + c.value, 0),
    }
  })
}

export async function loadProject(key: string) {
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.key, key) })
  if (!project) throw createError({ status: 404, message: 'Project not found' })
  return project
}

export async function loadTask(id: number) {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, id) })
  if (!task) throw createError({ status: 404, message: 'Task not found' })
  return task
}

/** Board/list DTOs with labels and counts, loaded in a handful of batched queries. */
export async function toTaskDTOs(rows: TaskRow[]): Promise<TaskDTO[]> {
  if (!rows.length) return []
  const ids = rows.map((r) => r.id)
  const projectIds = [...new Set(rows.map((r) => r.projectId))]
  const [projectRows, labelRows, subtasks, commentCounts, attachmentCounts, fieldRows, blockers] = await Promise.all([
    db.select({ id: schema.projects.id, key: schema.projects.key }).from(schema.projects).where(inArray(schema.projects.id, projectIds)),
    db.select().from(schema.taskLabels).where(inArray(schema.taskLabels.taskId, ids)),
    db
      .select({ parentId: schema.tasks.parentId, done: schema.projectStatuses.isDone, value: count() })
      .from(schema.tasks)
      .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
      .where(inArray(schema.tasks.parentId, ids))
      .groupBy(schema.tasks.parentId, schema.projectStatuses.isDone),
    db
      .select({ taskId: schema.taskComments.taskId, value: count() })
      .from(schema.taskComments)
      .where(inArray(schema.taskComments.taskId, ids))
      .groupBy(schema.taskComments.taskId),
    db
      .select({ taskId: schema.attachments.taskId, value: count() })
      .from(schema.attachments)
      .where(inArray(schema.attachments.taskId, ids))
      .groupBy(schema.attachments.taskId),
    db.select().from(schema.taskFieldValues).where(inArray(schema.taskFieldValues.taskId, ids)),
    // Open blockers: relations "X blocks task" where X is not in a done column.
    db
      .select({ taskId: schema.taskRelations.relatedTaskId, value: count() })
      .from(schema.taskRelations)
      .innerJoin(schema.tasks, eq(schema.taskRelations.taskId, schema.tasks.id))
      .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
      .where(and(inArray(schema.taskRelations.relatedTaskId, ids), eq(schema.taskRelations.type, 'blocks'), eq(schema.projectStatuses.isDone, false)))
      .groupBy(schema.taskRelations.relatedTaskId),
  ])
  const keys = new Map(projectRows.map((p) => [p.id, p.key]))
  return rows.map((t) => {
    const subs = subtasks.filter((s) => s.parentId === t.id)
    return {
      id: t.id,
      projectId: t.projectId,
      ref: `${keys.get(t.projectId) ?? '?'}-${t.number}`,
      number: t.number,
      title: t.title,
      statusId: t.statusId,
      priority: t.priority,
      assigneeId: t.assigneeId,
      parentId: t.parentId,
      ticketId: t.ticketId,
      startDate: t.startDate,
      dueDate: t.dueDate,
      position: t.position,
      repeat: t.repeat,
      repeatInterval: t.repeatInterval,
      fieldValues: Object.fromEntries(fieldRows.filter((f) => f.taskId === t.id).map((f) => [f.fieldId, f.value])),
      blockedByCount: blockers.find((b) => b.taskId === t.id)?.value ?? 0,
      labelIds: labelRows.filter((l) => l.taskId === t.id).map((l) => l.labelId),
      subtaskCount: subs.reduce((n, s) => n + s.value, 0),
      subtaskDoneCount: subs.filter((s) => s.done).reduce((n, s) => n + s.value, 0),
      commentCount: commentCounts.find((c) => c.taskId === t.id)?.value ?? 0,
      attachmentCount: attachmentCounts.find((c) => c.taskId === t.id)?.value ?? 0,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      completedAt: t.completedAt,
    }
  })
}

export async function taskDTO(id: number) {
  const [dto] = await toTaskDTOs([await loadTask(id)])
  return dto!
}

export async function toTaskCommentDTOs(rows: (typeof schema.taskComments.$inferSelect)[]): Promise<CommentDTO[]> {
  const [names, files] = await Promise.all([
    namesFor(rows.map((r) => r.authorId)),
    attachmentsFor('taskCommentId', rows.map((r) => r.id)),
  ])
  return rows.map((c) => ({
    id: c.id,
    ticketId: c.taskId,
    parentId: c.parentId,
    authorId: c.authorId,
    authorName: c.authorId ? (names.get(c.authorId) ?? 'Deleted user') : 'Deleted user',
    // Task comments are only ever seen by internal people.
    authorIsInternal: true,
    internal: false,
    body: c.body,
    createdAt: c.createdAt,
    attachments: files.get(c.id) ?? [],
  }))
}

export async function taskDetail(task: TaskRow): Promise<TaskDetailDTO> {
  const [[base], project, files, commentRows, subtaskRows, parent, activityRows] = await Promise.all([
    toTaskDTOs([task]),
    db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) }),
    attachmentsFor('taskId', [task.id]),
    db.select().from(schema.taskComments).where(eq(schema.taskComments.taskId, task.id)).orderBy(asc(schema.taskComments.createdAt)),
    db.select().from(schema.tasks).where(eq(schema.tasks.parentId, task.id)).orderBy(asc(schema.tasks.number)),
    task.parentId ? db.query.tasks.findFirst({ where: eq(schema.tasks.id, task.parentId) }) : undefined,
    db.select().from(schema.taskActivity).where(eq(schema.taskActivity.taskId, task.id)).orderBy(desc(schema.taskActivity.createdAt)).limit(100),
  ])
  const names = await namesFor([task.creatorId, ...activityRows.map((a) => a.actorId)])
  return {
    ...base!,
    description: task.description,
    creatorId: task.creatorId,
    creatorName: task.creatorId ? (names.get(task.creatorId) ?? null) : null,
    project: { id: project!.id, key: project!.key, name: project!.name, color: project!.color },
    attachments: files.get(task.id) ?? [],
    comments: await toTaskCommentDTOs(commentRows),
    subtasks: await toTaskDTOs(subtaskRows),
    parent: parent ? { id: parent.id, ref: `${project!.key}-${parent.number}`, title: parent.title } : null,
    relations: await relationsOf(task.id),
    followers: await taskFollowers(task.id),
    activity: activityRows.map((a) => ({
      id: a.id,
      actorId: a.actorId,
      actorName: a.actorId ? (names.get(a.actorId) ?? 'Deleted user') : 'Someone',
      field: a.field,
      fromValue: a.fromValue,
      toValue: a.toValue,
      createdAt: a.createdAt,
    })),
  }
}

export async function recordActivity(taskId: number, actorId: string, entries: { field: string; from?: string | null; to?: string | null }[]) {
  if (!entries.length) return
  await db.insert(schema.taskActivity).values(
    entries.map((e) => ({ taskId, actorId, field: e.field, fromValue: e.from ?? null, toValue: e.to ?? null })),
  )
}

/** Position for a card dropped at the end of a column. */
export async function nextPosition(statusId: number) {
  const [row] = await db.select({ value: max(schema.tasks.position) }).from(schema.tasks).where(eq(schema.tasks.statusId, statusId))
  return (row?.value ?? 0) + 1024
}

export async function ensureStatusInProject(statusId: number, projectId: number) {
  const status = await db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, statusId) })
  if (!status || status.projectId !== projectId) throw createError({ status: 400, message: 'That column belongs to another project' })
  return status
}

export async function ensureAssignable(userId: string | null | undefined) {
  if (!userId) return
  // Tasks go to people who can work on them: admins and members (not viewers or people outside the team).
  const user = await db.query.users.findFirst({
    where: and(eq(schema.users.id, userId), eq(schema.users.isGuest, false), inArray(schema.users.role, [...STAFF_ROLES])),
    columns: { id: true },
  })
  if (!user) throw createError({ status: 400, message: 'Tasks can only be assigned to admins and members' })
}

export async function setTaskLabels(taskId: number, labelIds: number[]) {
  await db.delete(schema.taskLabels).where(eq(schema.taskLabels.taskId, taskId))
  if (labelIds.length) {
    const valid = await db.select({ id: schema.labels.id }).from(schema.labels).where(inArray(schema.labels.id, labelIds))
    if (valid.length) await db.insert(schema.taskLabels).values(valid.map((l) => ({ taskId, labelId: l.id })))
  }
}

export async function members() {
  const rows = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.isGuest, false), inArray(schema.users.role, [...STAFF_ROLES])))
    .orderBy(asc(schema.users.name))
  return rows.map(toPublicUser)
}

export async function allLabels(): Promise<LabelDTO[]> {
  return db.select().from(schema.labels).orderBy(asc(schema.labels.name))
}

export function publishTask(event: H3Event, payload: RealtimeEvent) {
  publish(event, channels.members, payload)
}

export async function publishProject(event: H3Event, projectId: number) {
  const row = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) })
  if (!row) return
  const [dto] = await toProjectDTOs([row])
  publish(event, channels.members, { type: 'project.updated', body: dto! })
}

export interface NewTaskInput {
  title: string
  description?: string
  statusId?: number
  priority?: TaskPriority
  assigneeId?: string | null
  startDate?: string | null
  dueDate?: string | null
  labelIds?: number[]
  parentId?: number | null
  ticketId?: number | null
  repeat?: TaskRepeat | null
  repeatInterval?: number | null
  repeatedFromId?: number | null
  /** Custom field values keyed by field id. */
  fields?: Record<string, unknown>
  /** Enforce the project's required custom fields (the full create form does; quick-add from a column does not). */
  requireFields?: boolean
}

/** Creates a task (numbered within its project), records activity, publishes and notifies the assignee. */
export async function createTask(
  event: H3Event,
  user: { id: string; name: string },
  project: typeof schema.projects.$inferSelect,
  input: NewTaskInput,
) {

  const status = input.statusId
    ? await ensureStatusInProject(input.statusId, project.id)
    : await db.query.projectStatuses.findFirst({
        where: eq(schema.projectStatuses.projectId, project.id),
        orderBy: (s, { asc }) => [asc(s.position)],
      })
  if (!status) throw createError({ status: 400, message: 'This project has no columns' })
  await ensureAssignable(input.assigneeId)
  if (input.parentId) {
    const parent = await db.query.tasks.findFirst({ where: and(eq(schema.tasks.id, input.parentId), eq(schema.tasks.projectId, project.id)) })
    if (!parent) throw createError({ status: 400, message: 'The parent task is in another project' })
  }

  // Validate custom fields before claiming a number, so a rejected form does not leave a gap in the numbering.
  const fieldDefs = (await fieldsOf([project.id])).get(project.id) ?? []
  for (const [fieldId, raw] of Object.entries(input.fields ?? {})) {
    const def = fieldDefs.find((f) => String(f.id) === fieldId)
    if (!def) throw createError({ status: 400, message: 'Unknown field' })
    normaliseFieldValue(def, raw)
  }
  if (input.requireFields) {
    const missing = fieldDefs.filter((f) => f.required && normaliseFieldValue(f, input.fields?.[String(f.id)]) === null).map((f) => f.name)
    if (missing.length) throw createError({ status: 400, message: `Fill in ${missing.join(', ')}` })
  }

  // Claim the next number atomically so concurrent creates never collide.
  const [claimed] = await db
    .update(schema.projects)
    .set({ nextNumber: sql`${schema.projects.nextNumber} + 1` })
    .where(eq(schema.projects.id, project.id))
    .returning({ number: sql<number>`${schema.projects.nextNumber} - 1` })

  const [task] = await db
    .insert(schema.tasks)
    .values({
      projectId: project.id,
      number: claimed!.number,
      title: input.title,
      description: input.description ?? '',
      statusId: status.id,
      priority: input.priority ?? 'none',
      assigneeId: input.assigneeId ?? null,
      creatorId: user.id,
      parentId: input.parentId ?? null,
      ticketId: input.ticketId ?? null,
      repeat: input.repeat ?? null,
      repeatInterval: input.repeat === 'periodically' ? Math.max(1, input.repeatInterval ?? 1) : null,
      repeatedFromId: input.repeatedFromId ?? null,
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      position: await nextPosition(status.id),
      completedAt: status.isDone ? new Date() : null,
    })
    .returning()
  try {
    await applyFieldValues(task!.id, project.id, input.fields ?? {}, input.requireFields)
  } catch (error) {
    await db.delete(schema.tasks).where(eq(schema.tasks.id, task!.id))
    throw error
  }
  await setTaskLabels(task!.id, input.labelIds ?? [])
  await recordActivity(task!.id, user.id, [{ field: input.repeatedFromId ? 'repeated' : 'created' }])

  const dto = await taskDTO(task!.id)
  publishTask(event, { type: 'task.created', body: dto })
  await followTask(event, task!.id, [user.id, task!.assigneeId])
  if (task!.assigneeId && task!.assigneeId !== user.id) {
    await notify(event, task!.assigneeId, { type: 'task', message: `${user.name} assigned you ${dto.ref}: ${task!.title}`, link: `/projects/${project.key}/${task!.number}` })
  }
  return dto
}

// ---------------------------------------------------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------------------------------------------------

export async function relationsOf(taskId: number): Promise<TaskRelationDTO[]> {
  const rows = await db
    .select()
    .from(schema.taskRelations)
    .where(or(eq(schema.taskRelations.taskId, taskId), eq(schema.taskRelations.relatedTaskId, taskId)))
  if (!rows.length) return []
  const otherIds = rows.map((r) => (r.taskId === taskId ? r.relatedTaskId : r.taskId))
  const others = await db
    .select({
      id: schema.tasks.id,
      number: schema.tasks.number,
      title: schema.tasks.title,
      key: schema.projects.key,
      status: schema.projectStatuses.name,
      statusColor: schema.projectStatuses.color,
      isDone: schema.projectStatuses.isDone,
    })
    .from(schema.tasks)
    .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
    .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
    .where(inArray(schema.tasks.id, otherIds))
  const byId = new Map(others.map((o) => [o.id, o]))
  return rows.flatMap((r) => {
    const outgoing = r.taskId === taskId
    const other = byId.get(outgoing ? r.relatedTaskId : r.taskId)
    if (!other) return []
    const kind: RelationKind = r.type === 'relates' ? 'relates' : outgoing ? 'blocks' : 'blocked_by'
    return [{
      id: r.id,
      kind,
      task: { id: other.id, ref: `${other.key}-${other.number}`, title: other.title, projectKey: other.key, number: other.number, status: other.status, statusColor: other.statusColor, isDone: other.isDone },
    }]
  })
}

// ---------------------------------------------------------------------------------------------------------------------
// Custom fields
// ---------------------------------------------------------------------------------------------------------------------

/** Checks a value against its field definition; returns the normalised value, or null to clear it. */
export function normaliseFieldValue(field: FieldDTO, value: unknown): FieldValue | null {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return null
  const bad = (why: string) => createError({ status: 400, message: `${field.name}: ${why}` })
  switch (field.type) {
    case 'text':
      if (typeof value !== 'string') throw bad('expected text')
      return value.slice(0, 2000)
    case 'number': {
      const n = typeof value === 'number' ? value : Number(value)
      if (!Number.isFinite(n)) throw bad('expected a number')
      return n
    }
    case 'date':
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad('expected a date (YYYY-MM-DD)')
      return value
    case 'checkbox':
      if (typeof value !== 'boolean') throw bad('expected true or false')
      return value
    case 'select':
      if (typeof value !== 'string' || !field.options.includes(value)) throw bad('not one of the choices')
      return value
    case 'multiselect': {
      if (!Array.isArray(value) || value.some((v) => typeof v !== 'string' || !field.options.includes(v))) throw bad('not one of the choices')
      return [...new Set(value as string[])]
    }
  }
}

/**
 * Applies `{ [fieldId]: value | null }` to a task. With `requireAll`, every required field of the project must end up
 * with a value (used when creating through the full form).
 */
export async function applyFieldValues(taskId: number, projectId: number, values: Record<string, unknown>, requireAll = false) {
  const fields = (await fieldsOf([projectId])).get(projectId) ?? []
  const byId = new Map(fields.map((f) => [String(f.id), f]))
  const changed: string[] = []
  for (const [id, raw] of Object.entries(values)) {
    const field = byId.get(id)
    if (!field) throw createError({ status: 400, message: 'Unknown field' })
    const value = normaliseFieldValue(field, raw)
    if (value === null) {
      await db.delete(schema.taskFieldValues).where(and(eq(schema.taskFieldValues.taskId, taskId), eq(schema.taskFieldValues.fieldId, field.id)))
    } else {
      await db
        .insert(schema.taskFieldValues)
        .values({ taskId, fieldId: field.id, value })
        .onConflictDoUpdate({ target: [schema.taskFieldValues.taskId, schema.taskFieldValues.fieldId], set: { value } })
    }
    changed.push(field.name)
  }
  if (requireAll) {
    const present = new Set((await db.select().from(schema.taskFieldValues).where(eq(schema.taskFieldValues.taskId, taskId))).map((v) => v.fieldId))
    const missing = fields.filter((f) => f.required && !present.has(f.id)).map((f) => f.name)
    if (missing.length) throw createError({ status: 400, message: `Fill in ${missing.join(', ')}` })
  }
  return changed
}

// ---------------------------------------------------------------------------------------------------------------------
// Repeating tasks
// ---------------------------------------------------------------------------------------------------------------------

function shiftDay(day: string | null, repeat: TaskRepeat, interval: number | null) {
  if (!day) return null
  const d = new Date(`${day}T00:00:00Z`)
  if (repeat === 'daily') d.setUTCDate(d.getUTCDate() + 1)
  else if (repeat === 'weekly') d.setUTCDate(d.getUTCDate() + 7)
  else if (repeat === 'monthly') d.setUTCMonth(d.getUTCMonth() + 1)
  else if (repeat === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1)
  else d.setUTCDate(d.getUTCDate() + Math.max(1, interval ?? 1))
  return d.toISOString().slice(0, 10)
}

/** Dates of the next occurrence; undated repeating tasks are anchored on today. */
export function nextOccurrenceDates(task: { startDate: string | null; dueDate: string | null; repeat: TaskRepeat; repeatInterval: number | null }) {
  const today = new Date().toISOString().slice(0, 10)
  return {
    startDate: shiftDay(task.startDate, task.repeat, task.repeatInterval),
    dueDate: shiftDay(task.dueDate ?? (task.startDate ? null : today), task.repeat, task.repeatInterval),
  }
}

/**
 * Called when a repeating task reaches a done column: creates the next occurrence in the project's first open column
 * with the same details, shifted dates, labels and custom field values. Runs once per completed occurrence.
 */
export async function spawnNextOccurrence(event: H3Event, user: { id: string; name: string }, task: TaskRow) {
  if (!task.repeat) return null
  const already = await db.query.tasks.findFirst({ where: eq(schema.tasks.repeatedFromId, task.id), columns: { id: true } })
  if (already) return null
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) })
  const firstOpen = await db.query.projectStatuses.findFirst({
    where: and(eq(schema.projectStatuses.projectId, task.projectId), eq(schema.projectStatuses.isDone, false)),
    orderBy: (s, { asc }) => [asc(s.position)],
  })
  if (!project || !firstOpen) return null
  const [labels, values] = await Promise.all([
    db.select().from(schema.taskLabels).where(eq(schema.taskLabels.taskId, task.id)),
    db.select().from(schema.taskFieldValues).where(eq(schema.taskFieldValues.taskId, task.id)),
  ])
  const dates = nextOccurrenceDates({ startDate: task.startDate, dueDate: task.dueDate, repeat: task.repeat, repeatInterval: task.repeatInterval })
  const next = await createTask(event, user, project, {
    title: task.title,
    description: task.description,
    statusId: firstOpen.id,
    priority: task.priority,
    assigneeId: task.assigneeId,
    labelIds: labels.map((l) => l.labelId),
    parentId: task.parentId,
    repeat: task.repeat,
    repeatInterval: task.repeatInterval,
    repeatedFromId: task.id,
    ...dates,
  })
  // The next occurrence keeps the same followers.
  await followTask(event, next.id, (await taskFollowers(task.id)).map((f) => f.id))
  if (values.length) {
    await db.insert(schema.taskFieldValues).values(values.map((v) => ({ taskId: next.id, fieldId: v.fieldId, value: v.value })))
    publishTask(event, { type: 'task.updated', body: await taskDTO(next.id) })
  }
  return next
}
