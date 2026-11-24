import { eq, inArray, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = (await getValidatedRouterParams(event, idParams.parse)).id
  const ticket = await loadTicketFor(await withFreshRole(admin), id)

  const commentIds = (
    await db.select({ id: schema.comments.id }).from(schema.comments).where(eq(schema.comments.ticketId, id))
  ).map((c) => c.id)
  const files = await db
    .select({ pathname: schema.attachments.pathname })
    .from(schema.attachments)
    .where(or(eq(schema.attachments.ticketId, id), commentIds.length ? inArray(schema.attachments.commentId, commentIds) : undefined))

  // Work out who hears about it before the watcher rows cascade away.
  const outside = await outsideAudience(ticket)
  await db.delete(schema.tickets).where(eq(schema.tickets.id, id)) // comments, watchers and attachment rows cascade
  event.waitUntil(deleteBlobs(files.map((f) => f.pathname)))
  publish(event, [channels.members, ...outside.map(channels.user)], { type: 'ticket.deleted', body: { id } })
  if (ticket.visibility === 'public') await broadcastPublicIssue(event, ticket, 'removed')
  return { ok: true }
})
