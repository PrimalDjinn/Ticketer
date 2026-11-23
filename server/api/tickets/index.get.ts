import { and, count, desc, eq, gte, inArray, isNull, like, lte, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  status: z.enum(TICKET_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(200).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  mine: z.stringbool().optional(),
  /** Admins: `me`, `none`, or a user id. */
  assignee: z.string().max(64).optional(),
})

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const input = await getValidatedQuery(event, query.parse)
  const t = schema.tickets
  const where: (SQL | undefined)[] = []

  if (!user.isAdmin || input.mine) where.push(eq(t.creatorId, user.id))
  if (input.status) where.push(eq(t.status, input.status))
  if (user.isAdmin && input.assignee) {
    where.push(input.assignee === 'none' ? isNull(t.assigneeId) : eq(t.assigneeId, input.assignee === 'me' ? user.id : input.assignee))
  }
  if (input.from) where.push(gte(t.createdAt, input.from))
  if (input.to) where.push(lte(t.createdAt, new Date(input.to.getTime() + 86_400_000 - 1)))
  if (input.q) {
    const term = `%${input.q.replace(/[%_]/g, (m) => `\\${m}`)}%`
    const people = user.isAdmin
      ? await db
          .select({ id: schema.users.id })
          .from(schema.users)
          .where(or(like(schema.users.name, term), like(schema.users.email, term)))
          .limit(200)
      : []
    where.push(
      or(like(t.reference, term), like(t.info, term), people.length ? inArray(t.creatorId, people.map((p) => p.id)) : undefined),
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

  return { items: await withCreatorNames(rows), total: total?.value ?? 0, page: input.page, pageSize: input.pageSize }
})
