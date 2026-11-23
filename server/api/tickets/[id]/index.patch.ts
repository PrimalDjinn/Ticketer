import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    /** Support person handling the ticket (an admin), or null to unassign. */
    assigneeId: z.string().max(64).nullable().optional(),
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined, { message: 'Nothing to change' })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const input = await readValidatedBody(event, body.parse)
  const ticket = await loadTicketFor(admin, id)

  const now = new Date()
  const patch: Partial<typeof schema.tickets.$inferInsert> = {}
  if (input.status !== undefined && input.status !== ticket.status) {
    Object.assign(patch, { status: input.status, resolvedAt: input.status === 'Resolved' || input.status === 'Closed' ? now : null })
  }
  if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
    if (input.assigneeId) {
      const staff = await db.query.users.findFirst({ where: and(eq(schema.users.id, input.assigneeId), eq(schema.users.role, 'admin')), columns: { id: true } })
      if (!staff) throw createError({ status: 400, message: 'Tickets can only be assigned to support staff (admins)' })
    }
    patch.assigneeId = input.assigneeId
  }
  if (!Object.keys(patch).length) return ticketDTO(ticket)

  const [updated] = await db.update(schema.tickets).set({ ...patch, updatedAt: now }).where(eq(schema.tickets.id, id)).returning()
  await broadcastTicket(event, updated!, 'ticket.updated')

  const link = `/tickets/${id}`
  if (patch.status && updated!.creatorId && updated!.creatorId !== admin.id) {
    await notify(event, updated!.creatorId, { type: 'ticket', message: `Your ticket was marked ${patch.status.toLowerCase()} by ${admin.name}`, link })
  }
  if (patch.assigneeId && patch.assigneeId !== admin.id) {
    await notify(event, patch.assigneeId, { type: 'ticket', message: `${admin.name} assigned you ticket #${updated!.reference.slice(-8)}`, link })
  }
  return ticketDTO(updated!)
})
