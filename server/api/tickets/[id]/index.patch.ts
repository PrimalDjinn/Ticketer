import { and, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z
  .object({
    status: z.enum(TICKET_STATUSES).optional(),
    /** Staff person handling the ticket (an admin or member), or null to unassign. */
    assigneeId: z.string().max(64).nullable().optional(),
    /** public: anyone with the link (and the public issues page) can read it, except internal notes. */
    visibility: z.enum(TICKET_VISIBILITIES).optional(),
    title: z.string().trim().min(1, 'The title cannot be empty').max(140, 'Keep the title under 140 characters').optional(),
  })
  .refine((v) => v.status !== undefined || v.assigneeId !== undefined || v.visibility !== undefined || v.title !== undefined, {
    message: 'Nothing to change',
  })

export default defineEventHandler(async (event) => {
  const staff = await requireStaff(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const input = await readValidatedBody(event, body.parse)
  const ticket = await loadTicketFor(staff, id)

  const now = new Date()
  const patch: Partial<typeof schema.tickets.$inferInsert> = {}
  if (input.status !== undefined && input.status !== ticket.status) {
    Object.assign(patch, { status: input.status, resolvedAt: input.status === 'Resolved' || input.status === 'Closed' ? now : null })
  }
  if (input.assigneeId !== undefined && input.assigneeId !== ticket.assigneeId) {
    if (input.assigneeId) {
      const person = await db.query.users.findFirst({
        where: and(eq(schema.users.id, input.assigneeId), eq(schema.users.isGuest, false), inArray(schema.users.role, [...STAFF_ROLES])),
        columns: { id: true },
      })
      if (!person) throw createError({ status: 400, message: 'Tickets can only be assigned to admins and members' })
    }
    patch.assigneeId = input.assigneeId
  }
  if (input.visibility !== undefined && input.visibility !== ticket.visibility) {
    Object.assign(patch, { visibility: input.visibility, publishedAt: input.visibility === 'public' ? now : null })
  }
  if (input.title !== undefined && input.title !== ticket.title) patch.title = input.title
  if (!Object.keys(patch).length) return ticketDTO(ticket, staff)

  const [updated] = await db.update(schema.tickets).set({ ...patch, updatedAt: now }).where(eq(schema.tickets.id, id)).returning()
  // Whoever handles the ticket follows it.
  if (patch.assigneeId) await watchTicket(id, patch.assigneeId)
  if (patch.visibility) await broadcastPublicIssue(event, updated!, patch.visibility === 'public' ? 'published' : 'removed', staff.id)
  await broadcastTicket(event, updated!, 'ticket.updated')

  // Followers who can (still) see the ticket hear about status and visibility changes; never the person acting.
  const link = ticketLink(updated!)
  const title = quotedTitle(updated!)
  const followers = (await ticketFollowers(updated!)).all.filter((uid) => uid !== staff.id)
  if (patch.status) {
    const others = followers.filter((uid) => uid !== updated!.creatorId)
    if (updated!.creatorId && followers.includes(updated!.creatorId)) {
      await notify(event, updated!.creatorId, { type: 'ticket', message: `${staff.name} marked your ticket ${title} ${patch.status.toLowerCase()}`, link })
    }
    await notify(event, others, { type: 'ticket', message: `${staff.name} marked ${title} ${patch.status.toLowerCase()}`, link })
  }
  if (patch.visibility) {
    await notify(event, followers, {
      type: 'ticket',
      message: patch.visibility === 'public' ? `${staff.name} made ${title} public` : `${staff.name} made ${title} private`,
      link,
    })
  }
  if (patch.assigneeId && patch.assigneeId !== staff.id) {
    await notify(event, patch.assigneeId, { type: 'ticket', message: `${staff.name} assigned you ${title}`, link })
  }
  return ticketDTO(updated!, staff)
})
