import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** People who can be @mentioned on a ticket: everyone who can already see it. */
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const ticket = await loadTicketFor(user, id)
  const admins = await db.select().from(schema.users).where(eq(schema.users.isAdmin, true))
  const people = new Map(admins.map((a) => [a.id, toPublicUser(a)]))
  if (ticket.creatorId && !people.has(ticket.creatorId)) {
    const creator = await db.query.users.findFirst({ where: eq(schema.users.id, ticket.creatorId) })
    if (creator) people.set(creator.id, toPublicUser(creator))
  }
  people.delete(user.id)
  return [...people.values()]
})
