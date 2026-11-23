import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  info: z.string({ error: 'Describe the problem' }).trim().min(1, 'Describe the problem').max(10_000, 'Keep the description under 10,000 characters'),
  urgency: z.enum(TICKET_URGENCIES).default('Default'),
})

export default defineEventHandler(async (event) => {
  const user = await ensureUser(event)
  const { files, text } = await readMultipart(event)

  const { info, urgency } = fields.parse({ info: text('info'), urgency: text('urgency') })

  const [ticket] = await db
    .insert(schema.tickets)
    .values({ reference: ulid(), info, urgency, creatorId: user.id })
    .returning()

  try {
    await storeAttachments(`tickets/${ticket!.reference}`, files, { ticketId: ticket!.id }, user.id)
  } catch (error) {
    await db.delete(schema.tickets).where(eq(schema.tickets.id, ticket!.id))
    throw error
  }

  await broadcastTicket(event, ticket!, 'ticket.created')
  await notify(
    event,
    (await adminIds()).filter((id) => id !== user.id),
    { type: 'ticket', message: urgency === 'Default' ? `${user.name} opened a ticket` : `${user.name} opened an ${urgency.toLowerCase()} ticket`, link: `/tickets/${ticket!.id}` },
  )
  return ticketDTO(ticket!)
})
