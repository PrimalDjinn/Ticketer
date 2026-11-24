import { and, asc, eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

/**
 * Team (admins and members): turns the conversation into a ticket opened on behalf of the customer, who follows it.
 * The customer's messages become the description and a reply in the thread links the ticket.
 */
export default defineEventHandler(async (event): Promise<{ ticket: TicketDTO; conversation: ConversationDTO; message: ConversationMessageDTO | null }> => {
  const user = await requireStaff(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { row } = await loadConversationFor(user, id)

  if (row.ticketId) {
    const existing = await db.query.tickets.findFirst({ where: eq(schema.tickets.id, row.ticketId) })
    if (existing) {
      return { ticket: await ticketDTO(existing), conversation: (await toConversationDTOs([row], { id: user.id, asCustomer: false }))[0]!, message: null }
    }
  }

  const m = schema.conversationMessages
  const fromCustomer = await db
    .select()
    .from(m)
    .where(and(eq(m.conversationId, row.id), eq(m.internal, false), eq(m.authorId, row.customerId)))
    .orderBy(asc(m.createdAt), asc(m.id))
  const lines = fromCustomer.map((x) => x.body.trim()).filter(Boolean)
  const title = firstLine(row.subject || lines[0] || 'Support conversation', 120)
  let info = lines.join('\n\n') || title
  if (info.length > 10_000) info = `${info.slice(0, 9_990).trimEnd()}\n…`

  const [ticket] = await db
    .insert(schema.tickets)
    .values({ reference: ulid(), title, info, urgency: 'Default', creatorId: row.customerId, assigneeId: row.assigneeId, visibility: 'private' })
    .returning()
  await db.insert(schema.ticketWatchers).values({ ticketId: ticket!.id, userId: row.customerId }).onConflictDoNothing()
  const [updated] = await db.update(schema.conversations).set({ ticketId: ticket!.id }).where(eq(schema.conversations.id, row.id)).returning()

  await broadcastTicket(event, ticket!, 'ticket.created')

  // A reply the customer sees, so they know where to follow up.
  const ref = shortTicketRef(ticket!.reference)
  const { dto: message } = await addConversationMessage(updated!, {
    authorId: user.id,
    body: `I've opened ticket #${ref} for this so we can track it: "${title}". You'll get updates there as well.`,
    internal: false,
    files: [],
    uploaderId: user.id,
  })
  const [bumped] = await db.update(schema.conversations).set({ lastMessageAt: new Date(message.createdAt) }).where(eq(schema.conversations.id, row.id)).returning()
  broadcastConversationMessage(event, bumped!, message)
  await markConversationRead(event, bumped!, user.id, new Date(message.createdAt))
  await broadcastConversation(event, bumped!)
  await notify(event, row.customerId, { type: 'ticket', message: `Support opened ticket #${ref} for your conversation`, link: `/tickets/${ticket!.id}` })

  return {
    ticket: await ticketDTO(ticket!),
    conversation: (await toConversationDTOs([bumped!], { id: user.id, asCustomer: false }))[0]!,
    message,
  }
})
