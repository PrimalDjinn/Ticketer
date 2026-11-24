import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Stop following a ticket. */
export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  await loadTicketFor(user, id)
  await db.delete(schema.ticketWatchers).where(and(eq(schema.ticketWatchers.ticketId, id), eq(schema.ticketWatchers.userId, user.id)))
  return watcherState(id, user.id)
})
