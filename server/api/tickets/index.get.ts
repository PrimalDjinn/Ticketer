import { and, count, desc, eq, gte, inArray, isNull, lte, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Internal people: only tickets they opened. */
  mine: z.stringbool().optional(),
  /** Internal people: `me`, `none`, or a user id. */
  assignee: z.string().max(64).optional(),
  /** Internal people: public or private tickets only. */
  visibility: z.enum(TICKET_VISIBILITIES).optional(),
  /** People outside the team: their own tickets (default) or every public one. */
  scope: z.enum(['mine', 'public']).default('mine'),
})

export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const input = await getValidatedQuery(event, query.parse)
  const internal = isInternal(user)
  const t = schema.tickets
  const where: (SQL | undefined)[] = []

  if (internal) {
    if (input.mine) where.push(eq(t.creatorId, user.id))
    if (input.visibility) where.push(eq(t.visibility, input.visibility))
    if (input.assignee) {
      where.push(input.assignee === 'none' ? isNull(t.assigneeId) : eq(t.assigneeId, input.assignee === 'me' ? user.id : input.assignee))
    }
  } else {
    where.push(input.scope === 'public' ? eq(t.visibility, 'public') : eq(t.creatorId, user.id))
  }
  if (input.status) where.push(eq(t.status, input.status))
  if (input.from) where.push(gte(t.createdAt, input.from))
  if (input.to) where.push(lte(t.createdAt, new Date(input.to.getTime() + 86_400_000 - 1)))
  if (input.q) {
    // Only the team may search by reporter name or email.
    const people = internal
      ? await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(or(likeText(schema.users.name, input.q), likeText(schema.users.email, input.q)))
          .limit(200)
      : []
    where.push(
      or(likeText(t.reference, input.q), likeText(t.title, input.q), likeText(t.info, input.q), people.length ? inArray(t.creatorId, people.map((p) => p.id)) : undefined),
    )
  }

  const filter = and(...where)
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(t)
      .where(filter)
      .orderBy(desc(t.createdAt), desc(t.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(t).where(filter),
  ])

  const items = await withCreatorNames(rows, user)
  if (internal && rows.length) {
    // The team sees which tickets already went to a project, so a ticket isn't handed off twice.
    const linked = await db
      .select({ ticketId: schema.tasks.ticketId, number: schema.tasks.number, key: schema.projects.key })
      .from(schema.tasks)
      .innerJoin(schema.projects, eq(schema.tasks.projectId, schema.projects.id))
      .where(inArray(schema.tasks.ticketId, rows.map((r) => r.id)))
    for (const item of items) {
      item.tasks = linked.filter((l) => l.ticketId === item.id).map((l) => ({ ref: `${l.key}-${l.number}`, projectKey: l.key, number: l.number }))
    }
  }

  return { items, total: total?.value ?? 0, page: input.page, pageSize: input.pageSize }
})
