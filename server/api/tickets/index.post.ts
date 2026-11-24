import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  title: z.string({ error: 'Give the ticket a title' }).trim().min(1, 'Give the ticket a title').max(140, 'Keep the title under 140 characters'),
  info: z.string({ error: 'Describe the problem' }).trim().min(1, 'Describe the problem').max(10_000, 'Keep the description under 10,000 characters'),
  urgency: z.enum(TICKET_URGENCIES).default('Default'),
  /** Staff may publish straight away, e.g. a known-issue post or an announcement. */
  visibility: z.enum(TICKET_VISIBILITIES).default('private'),
})

export default defineEventHandler(async (event) => {
  const user = await withFreshRole(await ensureUser(event))
  const { files, text } = await readMultipart(event)

  const input = fields.parse({ title: text('title'), info: text('info'), urgency: text('urgency') || undefined, visibility: text('visibility') || undefined })
  if (input.visibility === 'public' && !ticketAccess.manage(user)) {
    throw createError({ status: 403, message: 'Only the support team can publish tickets' })
  }

  const now = new Date()
  const [ticket] = await db
    .insert(schema.tickets)
    .values({
      reference: ulid(),
      title: input.title,
      info: input.info,
      urgency: input.urgency,
      creatorId: user.id,
      visibility: input.visibility,
      publishedAt: input.visibility === 'public' ? now : null,
    })
    .returning()

  try {
    await storeAttachments(`tickets/${ticket!.reference}`, files, { ticketId: ticket!.id }, user.id)
  } catch (error) {
    await db.delete(schema.tickets).where(eq(schema.tickets.id, ticket!.id))
    throw error
  }
  await watchTicket(ticket!.id, user.id)

  if (ticket!.visibility === 'public') await broadcastPublicIssue(event, ticket!, 'published', user.id)
  await broadcastTicket(event, ticket!, 'ticket.created')
  const what = input.urgency === 'Default' ? 'a ticket' : `an ${input.urgency.toLowerCase()} ticket`
  await notify(
    event,
    (await adminIds()).filter((id) => id !== user.id),
    {
      type: 'ticket',
      message: input.visibility === 'public' ? `${user.name} published ${quotedTitle(ticket!)}` : `${user.name} opened ${what}: ${quotedTitle(ticket!)}`,
      link: ticketLink(ticket!),
    },
  )
  return ticketDTO(ticket!, user)
})
