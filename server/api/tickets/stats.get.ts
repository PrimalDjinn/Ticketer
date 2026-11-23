import { count, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event): Promise<TicketStats> => {
  const user = await requireUser(event)
  const rows = await db
    .select({ status: schema.tickets.status, value: count() })
    .from(schema.tickets)
    .where(user.isAdmin ? undefined : eq(schema.tickets.creatorId, user.id))
    .groupBy(schema.tickets.status)
  const stats: TicketStats = { Open: 0, Pending: 0, Resolved: 0, Closed: 0 }
  for (const row of rows) stats[row.status] = row.value
  return stats
})
