import { and, eq, inArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * People who can be @mentioned on a ticket: everyone on the team, plus the reporter and followers who can see it.
 * Each carries `isInternal`, so the composer offers only the team while writing an internal note (the server enforces
 * the same rule). People outside the team never receive email addresses.
 */
export default defineEventHandler(async (event) => {
  const user = await ticketViewer(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const ticket = await loadTicketFor(user, id)

  const team = await db
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.isGuest, false), inArray(schema.users.role, [...INTERNAL_ROLES])))
  const outsideIds = (await ticketFollowers(ticket)).outside
  if (ticket.creatorId) outsideIds.push(ticket.creatorId)
  const outside = outsideIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, outsideIds)) : []

  const people = new Map([...team, ...outside].map((u) => [u.id, toPublicUser(u)]))
  people.delete(user.id)
  const scrub = !isInternal(user)
  return [...people.values()]
    .map((p) => (scrub ? { ...p, email: null } : p))
    .sort((a, b) => Number(b.isInternal) - Number(a.isInternal) || a.name.localeCompare(b.name))
})
