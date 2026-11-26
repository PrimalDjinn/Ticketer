import type { H3Event } from 'h3'
import { and, asc, desc, eq, gt, inArray, lt } from 'drizzle-orm'
import { z } from 'zod'
import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

/**
 * The event log (rfcs/0001-apps-platform.md, phase 0). Every change the team hears about in realtime is also recorded
 * here, so webhooks and `GET /api/v1/events` see exactly what the team sees, from every route, GitHub sync and the
 * integration API alike. `publish` (utils/realtime.ts) hands each team-channel payload to `recordRealtime`.
 */
const log = useLogger('events')

export interface EventActor {
  type: 'user' | 'app' | 'system'
  id: string | null
  name: string | null
}

export type EventRow = typeof schema.events.$inferSelect

/** Who caused the change: set by requireUser/ensureUser, API tokens, the integration API and GitHub sync. */
export function setEventActor(event: H3Event, actor: EventActor) {
  event.context.eventActor ??= actor
}

function eventActor(event: H3Event): EventActor {
  return (event.context.eventActor as EventActor | undefined) ?? { type: 'system', id: null, name: null }
}

/** Realtime type → public event type and its subject. Anything not listed (reads, typing, followers…) isn't recorded. */
const REALTIME: Record<string, { type: (body: Body, isNew: boolean) => WebhookEventType; subject: string; id: (body: Body) => unknown }> = {
  'ticket.created': { type: () => 'ticket.created', subject: 'ticket', id: (b) => b.id },
  'ticket.updated': { type: () => 'ticket.updated', subject: 'ticket', id: (b) => b.id },
  'ticket.deleted': { type: () => 'ticket.deleted', subject: 'ticket', id: (b) => b.id },
  'comment.created': { type: () => 'ticket.comment.created', subject: 'ticket.comment', id: (b) => b.id },
  'comment.deleted': { type: () => 'ticket.comment.deleted', subject: 'ticket.comment', id: (b) => b.id },
  'conversation.updated': { type: (_, isNew) => (isNew ? 'conversation.created' : 'conversation.updated'), subject: 'conversation', id: (b) => b.id },
  'conversation.message': { type: () => 'conversation.message.created', subject: 'conversation.message', id: (b) => b.id },
  'project.updated': { type: () => 'project.updated', subject: 'project', id: (b) => b.id },
  'project.deleted': { type: () => 'project.deleted', subject: 'project', id: (b) => b.id },
  'task.created': { type: () => 'task.created', subject: 'task', id: (b) => b.id },
  'task.updated': { type: () => 'task.updated', subject: 'task', id: (b) => b.id },
  'task.deleted': { type: () => 'task.deleted', subject: 'task', id: (b) => b.id },
  'task.comment.created': { type: () => 'task.comment.created', subject: 'task.comment', id: (b) => b.id },
  'task.comment.deleted': { type: () => 'task.comment.deleted', subject: 'task.comment', id: (b) => b.id },
}
type Body = Record<string, unknown>

/** Fields that change on their own (per-viewer counters, timestamps) and say nothing about what someone did. */
const IGNORED_CHANGES = new Set(['updatedAt', 'unread', 'preview', 'lastMessage', 'lastMessageAt', 'watching', 'customerReadAt', 'teamReadAt'])

/** Keeps events about the same subject in order within this server (they're written after the response). */
const chains = new Map<string, Promise<unknown>>()

/** Called by `publish` for every payload on the team channel. Never throws; never delays the response. */
export function recordRealtime(event: H3Event, payload: { type: string; body: unknown }) {
  const map = REALTIME[payload.type]
  if (!map || !payload.body || typeof payload.body !== 'object') return
  const body = payload.body as Body
  const subjectId = String(map.id(body))
  const key = `${map.subject}:${subjectId}`
  const actor = eventActor(event)
  const occurredAt = new Date()
  const run = (chains.get(key) ?? Promise.resolve())
    .then(() => writeEvent(event, map, body, subjectId, actor, occurredAt))
    .catch((error) => log.error('could not record event', { type: payload.type, error: error instanceof Error ? error.message : String(error) }))
  chains.set(key, run)
  run.finally(() => chains.get(key) === run && chains.delete(key))
  event.waitUntil(run)
}

async function writeEvent(event: H3Event, map: (typeof REALTIME)[string], body: Body, subjectId: string, actor: EventActor, occurredAt: Date) {
  const updating = map.type(body, false).endsWith('.updated')
  let previous: EventRow | undefined
  if (updating) {
    ;[previous] = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.subjectType, map.subject), eq(schema.events.subjectId, subjectId)))
      .orderBy(desc(schema.events.id))
      .limit(1)
  }
  // A conversation's first update is its creation (support chats are created and announced in one step).
  const isNew = map.subject === 'conversation' && !previous && isRecent(body.createdAt, occurredAt)
  const type = map.type(body, isNew)
  const changes = previous && type.endsWith('.updated') ? diff(previous.data, body) : null
  if (type.endsWith('.updated') && previous && !changes) return // nothing anyone did changed

  const [row] = await db
    .insert(schema.events)
    .values({
      id: `evt_${ulid().toLowerCase()}`,
      type,
      occurredAt,
      actorType: actor.type,
      actorId: actor.id,
      actorName: actor.name,
      subjectType: map.subject,
      subjectId,
      data: body,
      changes,
    })
    .returning()
  await queueWebhookDeliveries(event, row!)
}

function isRecent(value: unknown, now: Date) {
  const at = value ? new Date(value as string | number) : null
  return !!at && !Number.isNaN(at.getTime()) && now.getTime() - at.getTime() < 2 * 60_000
}

function diff(before: Record<string, unknown>, after: Body) {
  const changes: Record<string, { from: unknown; to: unknown }> = {}
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (IGNORED_CHANGES.has(key)) continue
    if (JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null)) changes[key] = { from: before[key] ?? null, to: after[key] ?? null }
  }
  return Object.keys(changes).length ? changes : null
}

/** The public shape of an event (webhook payload `data`, `GET /api/v1/events`). */
export function toEventDTO(row: EventRow) {
  return {
    id: row.id,
    type: row.type,
    occurredAt: row.occurredAt,
    actor: { type: row.actorType, id: row.actorId, name: row.actorName },
    subject: { type: row.subjectType, id: row.subjectId },
    data: row.data,
    changes: row.changes ?? null,
  }
}
export type EventDTO = ReturnType<typeof toEventDTO>

/** Is this event about an internal note (ticket comment or chat message marked internal)? */
export function isInternalNoteEvent(row: Pick<EventRow, 'data'>) {
  return (row.data as { internal?: unknown }).internal === true
}

/** For receivers without internal notes: a chat's preview of its latest message may be one. */
export function withoutNotePreview<T>(data: T): T {
  const preview = (data as { preview?: { internal?: boolean } | null })?.preview
  return preview?.internal ? ({ ...data, preview: null } as T) : data
}

/** Removes `email` fields (anywhere in the payload) for receivers without access to email addresses. */
export function withoutEmails<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutEmails) as T
  if (!value || typeof value !== 'object' || value instanceof Date) return value
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'email').map(([key, item]) => [key, withoutEmails(item)])) as T
}

/** Hourly housekeeping: events older than 30 days, deliveries older than 7, idempotency keys older than 1. */
export async function pruneEventData() {
  const day = 86_400_000
  await db.delete(schema.events).where(lt(schema.events.occurredAt, new Date(Date.now() - 30 * day)))
  await db.delete(schema.webhookDeliveries).where(lt(schema.webhookDeliveries.createdAt, new Date(Date.now() - 7 * day)))
  await db.delete(schema.idempotencyKeys).where(lt(schema.idempotencyKeys.createdAt, new Date(Date.now() - day)))
}

/** Event rows by id, for redelivery. */
export async function eventsById(ids: string[]) {
  if (!ids.length) return []
  return db.select().from(schema.events).where(inArray(schema.events.id, ids))
}

/** The read scope an event type needs (`GET /api/v1/events`). */
export function scopeForEvent(type: string): ApiScope {
  if (type.startsWith('ticket.')) return 'tickets:read'
  if (type.startsWith('conversation.')) return 'conversations:read'
  if (type.startsWith('task.')) return 'tasks:read'
  return 'projects:read'
}

const eventsQuery = z.object({
  after: z.string().max(40).optional(),
  types: z.string().max(500).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

/** `GET /api/v1/events`: team only, oldest first after `after`, filtered by the token's scopes. */
export async function listEvents(event: H3Event) {
  await requireInternal(event)
  const input = await getValidatedQuery(event, eventsQuery.parse)
  const types = input.types?.split(',').map((t) => t.trim()).filter(Boolean)
  const rows = await db
    .select()
    .from(schema.events)
    .where(and(input.after ? gt(schema.events.id, input.after) : undefined, types?.length ? inArray(schema.events.type, types) : undefined))
    .orderBy(asc(schema.events.id))
    .limit(input.limit)
  const notes = hasApiScope(event, 'notes:read')
  const data = rows
    .filter((row) => hasApiScope(event, scopeForEvent(row.type)) && (notes || !isInternalNoteEvent(row)))
    .map((row) => (notes ? toEventDTO(row) : { ...toEventDTO(row), data: withoutNotePreview(row.data) }))
  // `next` moves past filtered-out events too, so polling never stalls on them.
  return { data, next: rows.at(-1)?.id ?? input.after ?? null }
}
