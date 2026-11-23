import { eq, inArray, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = (await getValidatedRouterParams(event, idParams.parse)).id
  const ticket = await loadTicketFor(admin, id)

  const commentIds = (
    await db.select({ id: schema.comments.id }).from(schema.comments).where(eq(schema.comments.ticketId, id))
  ).map((c) => c.id)
  const files = await db
    .select({ pathname: schema.attachments.pathname })
    .from(schema.attachments)
    .where(or(eq(schema.attachments.ticketId, id), commentIds.length ? inArray(schema.attachments.commentId, commentIds) : undefined))

  await db.delete(schema.tickets).where(eq(schema.tickets.id, id)) // comments and attachment rows cascade
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))

  publish(event, ticketAudience(ticket), { type: 'ticket.deleted', body: { id } })
  return { ok: true }
})
