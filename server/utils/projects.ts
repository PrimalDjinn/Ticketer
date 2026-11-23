import type { H3Event } from 'h3'
import { and, asc, count, desc, eq, inArray, isNull, max, ne, sql } from 'drizzle-orm'
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

export async function toProjectDTOs(rows: ProjectRow[]): Promise<ProjectDTO[]> {
  const ids = rows.map((r) => r.id)
  const statuses = await statusesOf(ids)
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
  const [projectRows, labelRows, subtasks, commentCounts, attachmentCounts] = await Promise.all([
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
  const user = await db.query.users.findFirst({ where: and(eq(schema.users.id, userId), eq(schema.users.isGuest, false)), columns: { id: true } })
  if (!user) throw createError({ status: 400, message: 'That person is not a member' })
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
    .where(and(eq(schema.users.isGuest, false), ne(schema.users.role, 'viewer')))
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
      startDate: input.startDate ?? null,
      dueDate: input.dueDate ?? null,
      position: await nextPosition(status.id),
      completedAt: status.isDone ? new Date() : null,
    })
    .returning()
  await setTaskLabels(task!.id, input.labelIds ?? [])
  await recordActivity(task!.id, user.id, [{ field: 'created' }])

  const dto = await taskDTO(task!.id)
  publishTask(event, { type: 'task.created', body: dto })
  if (task!.assigneeId && task!.assigneeId !== user.id) {
    await notify(event, task!.assigneeId, { type: 'task', message: `${user.name} assigned you ${dto.ref}: ${task!.title}`, link: `/projects/${project.key}/${task!.number}` })
  }
  return dto
}
