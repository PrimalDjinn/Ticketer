import type { H3Event } from 'h3'
import { and, asc, count, eq, inArray, sql, type SQL, type SQLWrapper } from 'drizzle-orm'
import { db, schema } from 'hub:db'

type TicketRow = typeof schema.tickets.$inferSelect
type CommentRow = typeof schema.comments.$inferSelect

/** Whoever is asking about a ticket. Pass a user with a fresh role (see `ticketViewer`). */
export type TicketViewer = { id: string; role: UserRole; isGuest: boolean; isAdmin?: boolean; name?: string }

/** The session user with the role re-read from the database, so a demotion takes effect immediately. */
export async function ticketViewer(event: H3Event) {
  return withFreshRole(await requireUser(event))
}

/** Like `ticketViewer`, but `null` for visitors without any session (public pages and file downloads). */
export async function optionalTicketViewer(event: H3Event) {
  const session = await getUserSession(event)
  return session.user ? withFreshRole(session.user) : null
}

// ---------------------------------------------------------------------------------------------------------------------
// Access rules (see the permission table in the docs): internal people see every ticket, the reporter sees their own,
// anyone sees public ones. Only staff (admin, member) change tickets or write internal notes.
// ---------------------------------------------------------------------------------------------------------------------

type TicketLike = Pick<TicketRow, 'creatorId' | 'visibility'>

export const ticketAccess = {
  see(user: TicketViewer | null, ticket: TicketLike) {
    if (ticket.visibility === 'public') return true
    if (!user) return false
    return isInternal(user) || (!!ticket.creatorId && ticket.creatorId === user.id)
  },
  /** Status, assignee, visibility, title, internal notes. */
  manage(user: TicketViewer | null) {
    return isStaff(user)
  },
  /** Staff anywhere; the reporter on their own ticket; registered outside people on public tickets. Viewers read. */
  reply(user: TicketViewer | null, ticket: TicketLike) {
    if (!user) return false
    if (isStaff(user)) return true
    if (ticket.creatorId && ticket.creatorId === user.id) return true
    return ticket.visibility === 'public' && !user.isGuest && !isInternal(user)
  },
  /** Anyone who can see it, except guests on public tickets they did not open. */
  follow(user: TicketViewer | null, ticket: TicketLike) {
    if (!user || !ticketAccess.see(user, ticket)) return false
    return !user.isGuest || ticket.creatorId === user.id
  },
}

/** Loads a ticket the user may see. Anything else is "not found" so ticket ids cannot be probed. */
export async function loadTicketFor(user: TicketViewer | null, id: number) {
  const ticket = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, id) })
  if (!ticket || !ticketAccess.see(user, ticket)) throw createError({ status: 404, message: 'Ticket not found' })
  return ticket
}

// ---------------------------------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------------------------------

type Person = { id: string; name: string; internal: boolean }

/** Display names and whether each person is on the team. */
export async function peopleFor(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  const map = new Map<string, Person>()
  if (!unique.length) return map
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name, role: schema.users.role, isGuest: schema.users.isGuest })
    .from(schema.users)
    .where(inArray(schema.users.id, unique))
  for (const row of rows) map.set(row.id, { id: row.id, name: displayName(row), internal: isInternal(row) })
  return map
}

export async function namesFor(ids: (string | null | undefined)[]) {
  const people = await peopleFor(ids)
  return new Map([...people].map(([id, p]) => [id, p.name]))
}

// ---------------------------------------------------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------------------------------------------------

/** First non-empty line of the description, for tickets created before titles existed. */
export function ticketTitle(t: Pick<TicketRow, 'title' | 'info'>) {
  const title = t.title?.trim()
  if (title) return title
  const line = t.info.split('\n').find((l) => l.trim())?.trim() ?? ''
  if (!line) return 'Untitled ticket'
  return line.length > 120 ? `${line.slice(0, 119)}…` : line
}

/**
 * The ticket as the API returns it. People outside the team never receive other people's user ids: `creatorId` is
 * kept only when it is their own, `assigneeId` is dropped (the name stays).
 */
export function toTicketDTO(t: TicketRow, creatorName?: string | null, assigneeName?: string | null, viewer?: TicketViewer | null): TicketDTO {
  const outside = !!viewer && !isInternal(viewer)
  return {
    id: t.id,
    reference: t.reference,
    title: ticketTitle(t),
    info: t.info,
    urgency: t.urgency,
    status: t.status,
    creatorId: outside && t.creatorId !== viewer!.id ? null : t.creatorId,
    creatorName: creatorName ?? null,
    assigneeId: outside ? null : t.assigneeId,
    assigneeName: assigneeName ?? null,
    visibility: t.visibility,
    publishedAt: t.publishedAt,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
  }
}

export async function withCreatorNames(rows: TicketRow[], viewer?: TicketViewer | null) {
  const names = await namesFor(rows.flatMap((r) => [r.creatorId, r.assigneeId]))
  return rows.map((r) => toTicketDTO(r, r.creatorId ? names.get(r.creatorId) : null, r.assigneeId ? names.get(r.assigneeId) : null, viewer))
}

/** One ticket with both names resolved. */
export async function ticketDTO(row: TicketRow, viewer?: TicketViewer | null) {
  return (await withCreatorNames([row], viewer))[0]!
}

/** Comments as `viewer` may receive them. Internal notes are dropped for anyone not on the team. */
export async function toCommentDTOs(rows: CommentRow[], viewer?: TicketViewer | null): Promise<CommentDTO[]> {
  const outside = !!viewer && !isInternal(viewer)
  const visible = outside ? visibleComments(rows) : rows
  const [people, files] = await Promise.all([
    peopleFor(visible.map((r) => r.authorId)),
    attachmentsFor('commentId', visible.map((r) => r.id)),
  ])
  return visible.map((c) => {
    const author = c.authorId ? people.get(c.authorId) : undefined
    return {
      id: c.id,
      ticketId: c.ticketId,
      parentId: c.parentId,
      authorId: outside && c.authorId !== viewer!.id ? null : c.authorId,
      authorName: author?.name ?? 'Deleted user',
      authorIsInternal: author?.internal ?? false,
      internal: c.internal,
      body: c.body,
      createdAt: c.createdAt,
      attachments: files.get(c.id) ?? [],
    }
  })
}

/** Non-internal comments whose whole reply chain is non-internal (a reply under an internal note stays hidden). */
export function visibleComments<T extends Pick<CommentRow, 'id' | 'parentId' | 'internal'>>(rows: T[]) {
  const byId = new Map(rows.map((r) => [r.id, r]))
  const hidden = (c: T): boolean => {
    for (let node: T | undefined = c, depth = 0; node && depth < 50; node = node.parentId ? byId.get(node.parentId) : undefined, depth++) {
      if (node.internal) return true
    }
    return false
  }
  return rows.filter((c) => !hidden(c))
}

export async function watcherState(ticketId: number, userId?: string) {
  const [[total], mine] = await Promise.all([
    db.select({ value: count() }).from(schema.ticketWatchers).where(eq(schema.ticketWatchers.ticketId, ticketId)),
    userId
      ? db.query.ticketWatchers.findFirst({ where: and(eq(schema.ticketWatchers.ticketId, ticketId), eq(schema.ticketWatchers.userId, userId)) })
      : undefined,
  ])
  return { watching: !!mine, watcherCount: total?.value ?? 0 }
}

/** Follows a ticket (no-op when already following). */
export async function watchTicket(ticketId: number, userId: string) {
  await db.insert(schema.ticketWatchers).values({ ticketId, userId }).onConflictDoNothing()
}

export async function ticketDetail(ticket: TicketRow, viewer?: TicketViewer | null): Promise<TicketDetailDTO> {
  const internal = !viewer || isInternal(viewer)
  const [names, files, commentRows, watchers, conversation] = await Promise.all([
    namesFor([ticket.creatorId, ticket.assigneeId]),
    attachmentsFor('ticketId', [ticket.id]),
    db.select().from(schema.comments).where(eq(schema.comments.ticketId, ticket.id)).orderBy(asc(schema.comments.createdAt), asc(schema.comments.id)),
    watcherState(ticket.id, viewer?.id),
    db.query.conversations.findFirst({ where: eq(schema.conversations.ticketId, ticket.id), columns: { id: true, customerId: true } }),
  ])
  const linked = internal
    ? await db
        .select({ id: schema.tasks.id, number: schema.tasks.number, title: schema.tasks.title, key: schema.projects.key, status: schema.projectStatuses.name, isDone: schema.projectStatuses.isDone })
        .from(schema.tasks)
        .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
        .innerJoin(schema.projectStatuses, eq(schema.tasks.statusId, schema.projectStatuses.id))
        .where(eq(schema.tasks.ticketId, ticket.id))
    : []
  return {
    ...toTicketDTO(ticket, ticket.creatorId ? names.get(ticket.creatorId) : null, ticket.assigneeId ? names.get(ticket.assigneeId) : null, viewer),
    attachments: files.get(ticket.id) ?? [],
    comments: await toCommentDTOs(commentRows, viewer),
    ...watchers,
    // The team, and the customer of that conversation, can jump back to the chat.
    conversationId: conversation && (internal || conversation.customerId === viewer?.id) ? conversation.id : null,
    tasks: linked.map((t) => ({ id: t.id, ref: `${t.key}-${t.number}`, title: t.title, projectKey: t.key, number: t.number, status: t.status, isDone: t.isDone })),
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Audience: who hears about a ticket (realtime and notifications)
// ---------------------------------------------------------------------------------------------------------------------

/**
 * People with access to the ticket who follow it, split by whether they are on the team. Outside followers only count
 * while they can still see the ticket (the reporter always; anyone else only while it is public).
 */
export async function ticketFollowers(ticket: TicketRow) {
  const rows = await db
    .select({ id: schema.users.id, role: schema.users.role, isGuest: schema.users.isGuest })
    .from(schema.ticketWatchers)
    .innerJoin(schema.users, eq(schema.ticketWatchers.userId, schema.users.id))
    .where(eq(schema.ticketWatchers.ticketId, ticket.id))
  const internal: string[] = []
  const outside: string[] = []
  for (const row of rows) {
    if (isInternal(row)) internal.push(row.id)
    else if (ticketAccess.see(row, ticket)) outside.push(row.id)
  }
  return { internal, outside, all: [...internal, ...outside] }
}

/** People outside the team who should receive realtime updates for the ticket: the reporter and visible followers. */
export async function outsideAudience(ticket: TicketRow) {
  const ids = new Set((await ticketFollowers(ticket)).outside)
  if (ticket.creatorId) {
    const creator = await db.query.users.findFirst({ where: eq(schema.users.id, ticket.creatorId), columns: { id: true, role: true, isGuest: true } })
    if (creator && !isInternal(creator)) ids.add(creator.id)
  }
  return [...ids]
}

/** @deprecated Channels for activity everyone with access may hear (internal people and the reporter). */
export function ticketAudience(ticket: TicketRow) {
  const list = [channels.members]
  if (ticket.creatorId) list.push(channels.user(ticket.creatorId))
  return list
}

/**
 * Publishes a ticket-related event: the team gets `full` on the members channel; each outside recipient gets
 * `outside(userId)` on their own channel (return null to skip). Internal notes must pass `outside: null`.
 */
export async function publishToTicket(
  event: H3Event,
  ticket: TicketRow,
  full: RealtimeEvent,
  outside: ((userId: string) => RealtimeEvent | null) | null,
) {
  publish(event, channels.members, full)
  if (!outside) return
  for (const userId of await outsideAudience(ticket)) {
    const payload = outside(userId)
    if (payload) publish(event, channels.user(userId), payload)
  }
}

export async function broadcastTicket(event: H3Event, ticket: TicketRow, type: 'ticket.created' | 'ticket.updated') {
  const names = await namesFor([ticket.creatorId, ticket.assigneeId])
  const dto = (viewer?: TicketViewer) =>
    toTicketDTO(ticket, ticket.creatorId ? names.get(ticket.creatorId) : null, ticket.assigneeId ? names.get(ticket.assigneeId) : null, viewer)
  await publishToTicket(event, ticket, { type, body: dto() }, (userId) => ({ type, body: dto({ id: userId, role: 'external', isGuest: false }) }))
}

/** A new or deleted comment, with internal notes kept to the team. */
export async function broadcastComment(event: H3Event, ticket: TicketRow, comment: CommentRow) {
  const [full] = await toCommentDTOs([comment])
  if (comment.internal) return publish(event, channels.members, { type: 'comment.created', body: full! })
  await publishToTicket(event, ticket, { type: 'comment.created', body: full! }, (userId) => ({
    type: 'comment.created',
    body: { ...full!, authorId: full!.authorId === userId ? userId : null },
  }))
}

/** Case-insensitive "contains" match with `%`, `_` and `\` in the search text taken literally. */
export function likeText(column: SQLWrapper, text: string): SQL {
  const term = `%${text.replace(/[%_\\]/g, (m) => `\\${m}`)}%`
  return sql`${column} like ${term} escape '\\'`
}

export function ticketLink(ticket: Pick<TicketRow, 'id'>, commentId?: number) {
  return commentId ? `/tickets/${ticket.id}#comment-${commentId}` : `/tickets/${ticket.id}`
}

/** "Login fails on Safari" → quoted and shortened for notification text. */
export function quotedTitle(ticket: Pick<TicketRow, 'title' | 'info'>) {
  const title = ticketTitle(ticket)
  return `“${title.length > 60 ? `${title.slice(0, 59)}…` : title}”`
}

// ---------------------------------------------------------------------------------------------------------------------
// Public issues page (no account needed)
// ---------------------------------------------------------------------------------------------------------------------

/** Latest public activity; internal notes never bump `updatedAt`, so this reveals nothing about them. */
export const publicActivity = sql<number>`coalesce(${schema.tickets.updatedAt}, ${schema.tickets.publishedAt}, ${schema.tickets.createdAt})`

function excerpt(info: string, max = 220) {
  const flat = info.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

function latest(...dates: (Date | null | undefined)[]) {
  return new Date(Math.max(...dates.map((d) => (d ? new Date(d).getTime() : 0))))
}

export async function toPublicTicketDTOs(rows: TicketRow[]): Promise<PublicTicketDTO[]> {
  if (!rows.some((r) => r.visibility === 'public')) return []
  const visible = rows.filter((r) => r.visibility === 'public')
  const ids = visible.map((r) => r.id)
  const [names, replies] = await Promise.all([
    namesFor(visible.flatMap((r) => [r.creatorId, r.assigneeId])),
    db
      .select({ ticketId: schema.comments.ticketId, value: count() })
      .from(schema.comments)
      .where(and(inArray(schema.comments.ticketId, ids), eq(schema.comments.internal, false)))
      .groupBy(schema.comments.ticketId),
  ])
  const replyCount = new Map(replies.map((r) => [r.ticketId, r.value]))
  return visible.map((t) => ({
    id: t.id,
    reference: t.reference,
    title: ticketTitle(t),
    status: t.status,
    urgency: t.urgency,
    excerpt: excerpt(t.info),
    reporterName: t.creatorId ? (names.get(t.creatorId) ?? null) : null,
    assigneeName: t.assigneeId ? (names.get(t.assigneeId) ?? null) : null,
    createdAt: t.createdAt,
    publishedAt: t.publishedAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
    lastActivityAt: latest(t.updatedAt, t.publishedAt, t.createdAt),
    replyCount: replyCount.get(t.id) ?? 0,
  }))
}

export async function publicTicketDetail(ticket: TicketRow, viewer: TicketViewer | null): Promise<PublicTicketDetailDTO> {
  const [[base], files, commentRows, watchers] = await Promise.all([
    toPublicTicketDTOs([ticket]),
    attachmentsFor('ticketId', [ticket.id]),
    db.select().from(schema.comments).where(eq(schema.comments.ticketId, ticket.id)).orderBy(asc(schema.comments.createdAt), asc(schema.comments.id)),
    watcherState(ticket.id, viewer?.id),
  ])
  if (!base) throw createError({ status: 404, message: 'Issue not found' })
  const visible = visibleComments(commentRows)
  const [people, commentFiles] = await Promise.all([
    peopleFor(visible.map((c) => c.authorId)),
    attachmentsFor('commentId', visible.map((c) => c.id)),
  ])
  return {
    ...base,
    info: ticket.info,
    attachments: files.get(ticket.id) ?? [],
    comments: visible.map((c) => {
      const author = c.authorId ? people.get(c.authorId) : undefined
      return {
        id: c.id,
        parentId: c.parentId,
        authorName: author?.name ?? 'Deleted user',
        fromTeam: author?.internal ?? false,
        body: c.body,
        createdAt: c.createdAt,
        attachments: commentFiles.get(c.id) ?? [],
      }
    }),
    watcherCount: watchers.watcherCount,
    viewer: viewer
      ? {
          registered: !viewer.isGuest,
          internal: isInternal(viewer),
          isReporter: !!ticket.creatorId && ticket.creatorId === viewer.id,
          watching: watchers.watching,
          canReply: ticketAccess.reply(viewer, ticket),
          canFollow: ticketAccess.follow(viewer, ticket),
        }
      : null,
  }
}
