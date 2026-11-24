import { count, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Ticket counts by status: every ticket for the team, your own for everyone else. */
export default defineEventHandler(async (event): Promise<TicketStats> => {
  const user = await ticketViewer(event)
  const rows = await db
    .select({ status: schema.tickets.status, value: count() })
    .from(schema.tickets)
    .where(isInternal(user) ? undefined : eq(schema.tickets.creatorId, user.id))
    .groupBy(schema.tickets.status)
  const stats: TicketStats = { Open: 0, Pending: 0, Resolved: 0, Closed: 0 }
  for (const row of rows) stats[row.status] = row.value
  return stats
})
