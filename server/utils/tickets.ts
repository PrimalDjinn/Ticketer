import type { H3Event } from 'h3'
import { asc, eq, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

type TicketRow = typeof schema.tickets.$inferSelect

export async function namesFor(ids: (string | null | undefined)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))]
  const map = new Map<string, string>()
  if (!unique.length) return map
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.users)
    .where(inArray(schema.users.id, unique))
  for (const row of rows) map.set(row.id, displayName(row))
  return map
}

export function toTicketDTO(t: TicketRow, creatorName?: string | null): TicketDTO {
  return {
    id: t.id,
    reference: t.reference,
    info: t.info,
    urgency: t.urgency,
    status: t.status,
    creatorId: t.creatorId,
    creatorName: creatorName ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt,
  }
}

export async function withCreatorNames(rows: TicketRow[]) {
  const names = await namesFor(rows.map((r) => r.creatorId))
  return rows.map((r) => toTicketDTO(r, r.creatorId ? names.get(r.creatorId) : null))
}

/** Loads a ticket the current user may see: admins see everything, everyone else only their own tickets. */
export async function loadTicketFor(user: { id: string; isAdmin: boolean }, id: number) {
  const ticket = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, id) })
  if (!ticket) throw createError({ status: 404, message: 'Ticket not found' })
  if (!user.isAdmin && ticket.creatorId !== user.id) {
    // Same answer as "missing" so ticket ids cannot be probed.
    throw createError({ status: 404, message: 'Ticket not found' })
  }
  return ticket
}

export async function toCommentDTOs(rows: (typeof schema.comments.$inferSelect)[]): Promise<CommentDTO[]> {
  const [names, files] = await Promise.all([
    namesFor(rows.map((r) => r.authorId)),
    attachmentsFor('commentId', rows.map((r) => r.id)),
  ])
  return rows.map((c) => ({
    id: c.id,
    ticketId: c.ticketId,
    parentId: c.parentId,
    authorId: c.authorId,
    authorName: c.authorId ? (names.get(c.authorId) ?? 'Deleted user') : 'Deleted user',
    body: c.body,
    createdAt: c.createdAt,
    attachments: files.get(c.id) ?? [],
  }))
}

export async function ticketDetail(ticket: TicketRow): Promise<TicketDetailDTO> {
  const [names, files, commentRows] = await Promise.all([
    namesFor([ticket.creatorId]),
    attachmentsFor('ticketId', [ticket.id]),
    db.select().from(schema.comments).where(eq(schema.comments.ticketId, ticket.id)).orderBy(asc(schema.comments.createdAt)),
  ])
  return {
    ...toTicketDTO(ticket, ticket.creatorId ? names.get(ticket.creatorId) : null),
    attachments: files.get(ticket.id) ?? [],
    comments: await toCommentDTOs(commentRows),
  }
}

/** Who hears about activity on a ticket: every admin, plus the person who opened it. */
export function ticketAudience(ticket: TicketRow) {
  const list = [channels.admins]
  if (ticket.creatorId) list.push(channels.user(ticket.creatorId))
  return list
}

export function broadcastTicket(event: H3Event, ticket: TicketRow, type: 'ticket.created' | 'ticket.updated', creatorName?: string | null) {
  publish(event, ticketAudience(ticket), { type, body: toTicketDTO(ticket, creatorName) })
}
