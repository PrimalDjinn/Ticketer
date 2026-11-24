import { and, count, desc, eq, or, type SQL } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const query = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(TICKET_STATUSES).optional(),
  /** `active`: Open or Pending; `done`: Resolved or Closed. */
  state: z.enum(['active', 'done']).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

/** Public issues, newest activity first. No account needed; nothing private ever leaves this route. */
export default defineEventHandler(async (event): Promise<PublicTicketPage> => {
  const input = await getValidatedQuery(event, query.parse)
  const t = schema.tickets
  const where: (SQL | undefined)[] = [eq(t.visibility, 'public')]
  if (input.status) where.push(eq(t.status, input.status))
  else if (input.state) where.push(input.state === 'active' ? or(eq(t.status, 'Open'), eq(t.status, 'Pending')) : or(eq(t.status, 'Resolved'), eq(t.status, 'Closed')))
  if (input.q) where.push(or(likeText(t.title, input.q), likeText(t.info, input.q), likeText(t.reference, input.q)))

  const filter = and(...where)
  const [rows, [total]] = await Promise.all([
    db
      .select()
      .from(t)
      .where(filter)
      .orderBy(desc(publicActivity), desc(t.id))
      .limit(input.pageSize)
      .offset((input.page - 1) * input.pageSize),
    db.select({ value: count() }).from(t).where(filter),
  ])
  // Same answer for everyone; browsers revalidate so live updates are never served stale.
  setHeader(event, 'cache-control', 'public, no-cache')
  return { items: await toPublicTicketDTOs(rows), total: total?.value ?? 0, page: input.page, pageSize: input.pageSize }
})
