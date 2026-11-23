import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ status: z.enum(TICKET_STATUSES) })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const id = (await getValidatedRouterParams(event, idParams.parse)).id
  const { status } = await readValidatedBody(event, body.parse)
  const ticket = await loadTicketFor(admin, id)
  if (ticket.status === status) return toTicketDTO(ticket)

  const now = new Date()
  const [updated] = await db
    .update(schema.tickets)
    .set({ status, updatedAt: now, resolvedAt: status === 'Resolved' || status === 'Closed' ? now : null })
    .where(eq(schema.tickets.id, id))
    .returning()

  const names = await namesFor([updated!.creatorId])
  broadcastTicket(event, updated!, 'ticket.updated', updated!.creatorId ? names.get(updated!.creatorId) : null)
  if (updated!.creatorId && updated!.creatorId !== admin.id) {
    await notify(event, updated!.creatorId, {
      type: 'ticket',
      message: `Your ticket was marked ${status.toLowerCase()} by ${admin.name}`,
      link: `/tickets/${id}`,
    })
  }
  return toTicketDTO(updated!, updated!.creatorId ? names.get(updated!.creatorId) : null)
})
