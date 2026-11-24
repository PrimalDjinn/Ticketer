/**
 * Two-way sync between a project's tasks and its GitHub repository's issues.
 *
 * Ticketer → GitHub: after a task changes, `pushTask` writes its whole current state to the issue (title, body with a
 * link back, open/closed, labels): one idempotent PATCH, so ordering and retries can't leave the two apart.
 * GitHub → Ticketer: webhooks (`handleGithubEvent`) apply issue and comment changes to tasks.
 *
 * Echo prevention: everything we write to GitHub is attributed to the app's bot account, and webhooks sent by that bot
 * are ignored; changes applied from GitHub never trigger a push back. Repositories are addressed by numeric id
 * (`/repositories/:id`), so renames and transfers don't break the link.
 */
import type { H3Event } from 'h3'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'


type Link = typeof schema.projectGithub.$inferSelect
type TaskRow = typeof schema.tasks.$inferSelect

export async function projectGithubLink(projectId: number) {
  return db.query.projectGithub.findFirst({ where: eq(schema.projectGithub.projectId, projectId) })
}

// ---------------------------------------------------------------------------------------------------------------------
// Issue body: the task's description plus a link back, which is stripped again on the way in
// ---------------------------------------------------------------------------------------------------------------------

const FOOTER = /\n*-{3,}\n<sub>Synced with \[[^\]]*\]\([^)]*\)[^<]*<\/sub>\s*$/

export function stripFooter(body: string | null | undefined) {
  return (body ?? '').replace(/\r\n/g, '\n').replace(FOOTER, '').trimEnd()
}

function issueBody(description: string, ref: string, url: string, brand: string) {
  return `${description.trim()}\n\n---\n<sub>Synced with [${ref}](${url}) in ${brand}</sub>`
}

async function statusColumns(projectId: number) {
  const rows = await db.select().from(schema.projectStatuses).where(eq(schema.projectStatuses.projectId, projectId)).orderBy(asc(schema.projectStatuses.position))
  return { firstOpen: rows.find((s) => !s.isDone) ?? rows[0], firstDone: rows.find((s) => s.isDone), all: rows }
}

async function labelNames(taskId: number) {
  const rows = await db
    .select({ name: schema.labels.name })
    .from(schema.taskLabels)
    .innerJoin(schema.labels, eq(schema.taskLabels.labelId, schema.labels.id))
    .where(eq(schema.taskLabels.taskId, taskId))
  return rows.map((r) => r.name)
}

/** Our label ids for GitHub label names, creating labels that don't exist yet (matched case-insensitively). */
async function labelIdsFor(names: string[]) {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 20)
  if (!wanted.length) return []
  const existing = await db.select().from(schema.labels)
  const ids: number[] = []
  for (const name of wanted) {
    let label = existing.find((l) => l.name.toLowerCase() === name.toLowerCase())
    if (!label) {
      ;[label] = await db.insert(schema.labels).values({ name: name.slice(0, 40) }).onConflictDoNothing().returning()
      label ??= (await db.select().from(schema.labels).where(eq(schema.labels.name, name.slice(0, 40))))[0]
    }
    if (label) ids.push(label.id)
  }
  return ids
}

// ---------------------------------------------------------------------------------------------------------------------
// Ticketer → GitHub
// ---------------------------------------------------------------------------------------------------------------------

interface IssueResponse {
  id: number
  number: number
  html_url: string
  state: 'open' | 'closed'
}

/**
 * Writes the task's current state to its issue, creating the issue first when `create` is set (and the project creates
 * issues for new tasks) or when `force` is set (the "Create GitHub issue" button). Runs after the response; never throws.
 */
export function pushTask(event: H3Event, taskId: number, options: { create?: boolean; force?: boolean } = {}) {
  const work = pushTaskNow(event, taskId, options).catch((error) => logGithubError(`could not sync task ${taskId} to GitHub`, error))
  event.waitUntil(work)
  return work
}

export async function pushTaskNow(event: H3Event, taskId: number, options: { create?: boolean; force?: boolean } = {}) {
  const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, taskId) })
  if (!task) return null
  const link = await projectGithubLink(task.projectId)
  if (!link) return null
  const mapping = await db.query.taskGithub.findFirst({ where: eq(schema.taskGithub.taskId, taskId) })
  if (!mapping && !options.force && !(options.create && link.createIssues)) return null

  const config = await githubConfig(event)
  if (config.problem) return null
  const [project, status, labels, branding] = await Promise.all([
    db.query.projects.findFirst({ where: eq(schema.projects.id, task.projectId) }),
    db.query.projectStatuses.findFirst({ where: eq(schema.projectStatuses.id, task.statusId) }),
    labelNames(taskId),
    readBranding(),
  ])
  const ref = `${project!.key}-${task.number}`
  const origin = (await knownSiteOrigin()) ?? siteOrigin(event)
  const body = issueBody(task.description, ref, `${origin}/projects/${project!.key}/${task.number}`, brandName(branding, event))
  const state = status?.isDone ? 'closed' : 'open'
  const fields = { title: task.title, body, labels, state, ...(state === 'closed' && { state_reason: 'completed' }) }

  let issue: IssueResponse
  if (mapping) {
    issue = await asInstallation<IssueResponse>(config, link.installationId, `/repositories/${link.repoId}/issues/${mapping.issueNumber}`, { method: 'PATCH', body: fields })
  } else {
    issue = await asInstallation<IssueResponse>(config, link.installationId, `/repositories/${link.repoId}/issues`, {
      method: 'POST',
      body: { title: task.title, body, labels },
    })
    if (state === 'closed') {
      issue = await asInstallation<IssueResponse>(config, link.installationId, `/repositories/${link.repoId}/issues/${issue.number}`, {
        method: 'PATCH',
        body: { state: 'closed', state_reason: 'completed' },
      })
    }
  }
  await db
    .insert(schema.taskGithub)
    .values({ taskId, repoId: link.repoId, issueNumber: issue.number, url: issue.html_url, state: issue.state, syncedAt: new Date() })
    .onConflictDoUpdate({ target: schema.taskGithub.taskId, set: { url: issue.html_url, state: issue.state, syncedAt: new Date() } })
  if (!mapping) publishTask(event, { type: 'task.updated', body: await taskDTO(taskId) })
  return issue
}

/** Posts a task comment to the issue, when the project shares comments with GitHub. Runs after the response. */
export function pushComment(event: H3Event, commentId: number, author: string) {
  const work = (async () => {
    const comment = await db.query.taskComments.findFirst({ where: eq(schema.taskComments.id, commentId) })
    if (!comment || comment.githubCommentId) return
    const task = await db.query.tasks.findFirst({ where: eq(schema.tasks.id, comment.taskId) })
    const link = task && (await projectGithubLink(task.projectId))
    const mapping = link?.commentsToGithub && (await db.query.taskGithub.findFirst({ where: eq(schema.taskGithub.taskId, comment.taskId) }))
    if (!link || !mapping || !comment.body.trim()) return
    const config = await githubConfig(event)
    if (config.problem) return
    const posted = await asInstallation<{ id: number }>(config, link.installationId, `/repositories/${link.repoId}/issues/${mapping.issueNumber}/comments`, {
      method: 'POST',
      body: { body: `**${author}** wrote:\n\n${comment.body}` },
    })
    await db.update(schema.taskComments).set({ githubCommentId: posted.id }).where(eq(schema.taskComments.id, commentId))
  })().catch((error) => logGithubError(`could not post comment ${commentId} to GitHub`, error))
  event.waitUntil(work)
}

// ---------------------------------------------------------------------------------------------------------------------
// GitHub → Ticketer
// ---------------------------------------------------------------------------------------------------------------------

const account = z.object({ login: z.string(), type: z.string().optional(), id: z.number().optional() })
const issueShape = z.object({
  id: z.number(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.enum(['open', 'closed']),
  html_url: z.string(),
  user: account.nullable().optional(),
  labels: z.array(z.union([z.string(), z.object({ name: z.string() })])).default([]),
  pull_request: z.unknown().optional(),
})
type Issue = z.output<typeof issueShape>
const repoShape = z.object({ id: z.number(), full_name: z.string() })
const commentShape = z.object({ id: z.number(), body: z.string().nullable().optional(), html_url: z.string(), user: account.nullable().optional() })

const payloadShape = z.looseObject({
  action: z.string().optional(),
  sender: account.optional(),
  installation: z.looseObject({ id: z.number(), account: account.optional() }).optional(),
  repository: repoShape.optional(),
  issue: issueShape.optional(),
  comment: commentShape.optional(),
  changes: z.looseObject({ title: z.unknown().optional(), body: z.unknown().optional() }).optional(),
  label: z.object({ name: z.string() }).optional(),
})

const issueLabelNames = (issue: Issue) => issue.labels.map((l) => (typeof l === 'string' ? l : l.name))

/** Creates the task for an issue (import or a new issue), unless the issue is already linked. */
async function taskFromIssue(event: H3Event, link: Link, issue: Issue, by: string) {
  const existing = await db.query.taskGithub.findFirst({ where: and(eq(schema.taskGithub.repoId, link.repoId), eq(schema.taskGithub.issueNumber, issue.number)) })
  if (existing) return null
  const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, link.projectId) })
  if (!project) return null
  const columns = await statusColumns(project.id)
  const status = issue.state === 'closed' ? (columns.firstDone ?? columns.firstOpen) : columns.firstOpen
  const task = await createTask(event, { id: null, name: `${by} (GitHub)` }, project, {
    title: issue.title.slice(0, 300) || `Issue #${issue.number}`,
    description: stripFooter(issue.body).slice(0, 20_000),
    statusId: status?.id,
    labelIds: await labelIdsFor(issueLabelNames(issue)),
    fromGithub: true,
  })
  await db
    .insert(schema.taskGithub)
    .values({ taskId: task.id, repoId: link.repoId, issueNumber: issue.number, url: issue.html_url, state: issue.state, syncedAt: new Date() })
    .onConflictDoNothing()
  publishTask(event, { type: 'task.updated', body: await taskDTO(task.id) })
  return task
}

async function linkedTask(repoId: number, issueNumber: number): Promise<TaskRow | undefined> {
  const mapping = await db.query.taskGithub.findFirst({ where: and(eq(schema.taskGithub.repoId, repoId), eq(schema.taskGithub.issueNumber, issueNumber)) })
  return mapping ? db.query.tasks.findFirst({ where: eq(schema.tasks.id, mapping.taskId) }) : undefined
}

async function taskLink(project: { key: string }, task: TaskRow) {
  return { ref: `${project.key}-${task.number}`, link: `/projects/${project.key}/${task.number}` }
}

/** Applies one webhook delivery. Returns a short description of what happened, for the log and the response. */
export async function handleGithubEvent(event: H3Event, name: string, raw: unknown, config: GithubConfig): Promise<string> {
  const parsed = payloadShape.safeParse(raw)
  if (!parsed.success) return 'ignored: unexpected payload'
  const payload = parsed.data

  // Installations
  if (name === 'installation' && payload.installation) {
    const id = payload.installation.id
    if (payload.action === 'deleted') {
      await db.delete(schema.githubInstallations).where(eq(schema.githubInstallations.id, id))
      return 'installation removed'
    }
    const acct = payload.installation.account
    const suspended = payload.action === 'suspend'
    await db
      .insert(schema.githubInstallations)
      .values({ id, accountLogin: acct?.login ?? 'unknown', accountType: acct?.type ?? 'User', suspended })
      .onConflictDoUpdate({ target: schema.githubInstallations.id, set: { suspended, ...(acct && { accountLogin: acct.login, accountType: acct.type ?? 'User' }) } })
    return `installation ${payload.action ?? 'updated'}`
  }
  if (name === 'ping') return 'pong'

  // Our own writes come back as webhooks sent by the app's bot: nothing to do.
  if (payload.sender?.type === 'Bot' && payload.sender.login === `${config.slug}[bot]`) return 'ignored: our own change'
  if (!payload.repository || !payload.issue) return 'ignored: not an issue event'
  if (payload.issue.pull_request) return 'ignored: pull request'

  const link = await db.query.projectGithub.findFirst({ where: eq(schema.projectGithub.repoId, payload.repository.id) })
  if (!link) return 'ignored: repository not linked'
  const project = (await db.query.projects.findFirst({ where: eq(schema.projects.id, link.projectId) }))!
  const issue = payload.issue
  const by = payload.sender?.login ?? 'someone'

  if (name === 'issues') {
    if (payload.action === 'opened' || (payload.action === 'reopened' && link.importIssues && !(await linkedTask(link.repoId, issue.number)))) {
      if (!link.importIssues) return 'ignored: project does not import new issues'
      const task = await taskFromIssue(event, link, issue, by)
      return task ? `created ${task.ref}` : 'already linked'
    }
    const task = await linkedTask(link.repoId, issue.number)
    if (!task) return 'ignored: issue not linked to a task'
    const { ref, link: href } = await taskLink(project, task)

    switch (payload.action) {
      case 'edited': {
        const patch: Partial<TaskRow> = {}
        const activity: { field: string; from?: string | null; to?: string | null }[] = []
        if (payload.changes?.title !== undefined && issue.title !== task.title) {
          patch.title = issue.title.slice(0, 300)
          activity.push({ field: 'title', from: task.title, to: patch.title })
        }
        const description = stripFooter(issue.body)
        if (payload.changes?.body !== undefined && description !== task.description.trimEnd()) {
          patch.description = description.slice(0, 20_000)
          activity.push({ field: 'description' })
        }
        if (!activity.length) return 'no change'
        await db.update(schema.tasks).set({ ...patch, updatedAt: new Date() }).where(eq(schema.tasks.id, task.id))
        await recordActivity(task.id, null, activity)
        publishTask(event, { type: 'task.updated', body: await taskDTO(task.id) })
        return `updated ${ref}`
      }
      case 'closed':
      case 'reopened': {
        await db.update(schema.taskGithub).set({ state: issue.state, syncedAt: new Date() }).where(eq(schema.taskGithub.taskId, task.id))
        const columns = await statusColumns(project.id)
        const current = columns.all.find((s) => s.id === task.statusId)
        const target = payload.action === 'closed' ? columns.firstDone : columns.firstOpen
        if (!target || !current || current.isDone === target.isDone) return 'state already matches'
        await db
          .update(schema.tasks)
          .set({ statusId: target.id, position: await nextPosition(target.id), completedAt: target.isDone ? new Date() : null, updatedAt: new Date() })
          .where(eq(schema.tasks.id, task.id))
        await recordActivity(task.id, null, [{ field: 'status', from: current.name, to: target.name }])
        publishTask(event, { type: 'task.updated', body: await taskDTO(task.id) })
        await notifyTaskFollowers(event, task.id, '', {
          type: 'task',
          message: `${by} ${payload.action} ${ref} on GitHub: ${task.title}`,
          link: href,
        })
        return `${payload.action === 'closed' ? 'completed' : 'reopened'} ${ref}`
      }
      case 'labeled':
      case 'unlabeled': {
        const ids = await labelIdsFor(issueLabelNames(issue))
        await setTaskLabels(task.id, ids)
        publishTask(event, { type: 'task.updated', body: await taskDTO(task.id) })
        return `labels of ${ref} updated`
      }
      case 'deleted':
      case 'transferred': {
        await db.delete(schema.taskGithub).where(eq(schema.taskGithub.taskId, task.id))
        await recordActivity(task.id, null, [{ field: 'github', from: `#${issue.number}`, to: null }])
        publishTask(event, { type: 'task.updated', body: await taskDTO(task.id) })
        return `${ref} unlinked (issue ${payload.action})`
      }
      default:
        return `ignored: issues.${payload.action}`
    }
  }

  if (name === 'issue_comment' && payload.comment) {
    if (!link.commentsFromGithub) return 'ignored: comments from GitHub are off'
    const task = await linkedTask(link.repoId, issue.number)
    if (!task) return 'ignored: issue not linked to a task'
    const comment = payload.comment
    const { ref, link: href } = await taskLink(project, task)
    if (payload.action === 'created') {
      const [row] = await db
        .insert(schema.taskComments)
        .values({
          taskId: task.id,
          body: (comment.body ?? '').slice(0, 10_000),
          githubCommentId: comment.id,
          externalAuthor: comment.user?.login ?? by,
          externalUrl: comment.html_url,
        })
        .onConflictDoNothing()
        .returning()
      if (!row) return 'comment already mirrored'
      const [dto] = await toTaskCommentDTOs([row])
      publishTask(event, { type: 'task.comment.created', body: { ...dto!, taskId: task.id } })
      await notifyTaskFollowers(event, task.id, '', { type: 'comment', message: `${row.externalAuthor} commented on ${ref} on GitHub: ${task.title}`, link: `${href}#comment-${row.id}` })
      return `comment added to ${ref}`
    }
    const mirrored = await db.query.taskComments.findFirst({ where: eq(schema.taskComments.githubCommentId, comment.id) })
    if (!mirrored) return 'ignored: comment not mirrored'
    if (payload.action === 'edited') {
      await db.update(schema.taskComments).set({ body: (comment.body ?? '').slice(0, 10_000) }).where(eq(schema.taskComments.id, mirrored.id))
      const [dto] = await toTaskCommentDTOs([{ ...mirrored, body: comment.body ?? '' }])
      publishTask(event, { type: 'task.comment.created', body: { ...dto!, taskId: task.id } })
      return `comment on ${ref} edited`
    }
    if (payload.action === 'deleted') {
      await db.delete(schema.taskComments).where(eq(schema.taskComments.id, mirrored.id))
      publishTask(event, { type: 'task.comment.deleted', body: { id: mirrored.id, taskId: task.id } })
      return `comment on ${ref} deleted`
    }
  }
  return `ignored: ${name}.${payload.action ?? ''}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------------------------------------------------

/** Brings in open issues not linked yet, oldest first, up to `limit` per call. */
export async function importOpenIssues(event: H3Event, link: Link, by: string, limit = 100) {
  const config = await requireGithubConfig(event)
  let imported = 0
  let page = 1
  let more = true
  while (imported < limit && more) {
    const raw = await asInstallation<unknown[]>(config, link.installationId, `/repositories/${link.repoId}/issues?state=open&sort=created&direction=asc&per_page=100&page=${page}`)
    const issues = z.array(issueShape).catch([]).parse(raw)
    more = issues.length === 100
    page++
    for (const issue of issues) {
      if (issue.pull_request) continue
      if (await taskFromIssue(event, link, issue, issue.user?.login ?? by)) imported++
      if (imported >= limit) break
    }
    if (page > 10) break
  }
  return { imported, more: imported >= limit && more }
}

/** Numbers of tasks linked to issues in a project (for the settings screen). */
export async function linkedTaskCount(projectId: number) {
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(schema.taskGithub)
    .innerJoin(schema.tasks, eq(schema.taskGithub.taskId, schema.tasks.id))
    .where(eq(schema.tasks.projectId, projectId))
  return row?.value ?? 0
}

export async function githubForTasks(taskIds: number[]) {
  if (!taskIds.length) return new Map<number, { number: number; url: string; state: 'open' | 'closed' }>()
  const rows = await db.select().from(schema.taskGithub).where(inArray(schema.taskGithub.taskId, taskIds))
  return new Map(rows.map((r) => [r.taskId, { number: r.issueNumber, url: r.url, state: r.state }]))
}

