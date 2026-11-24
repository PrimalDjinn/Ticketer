import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  body: conversationMessageBody,
  /** Team only: a note between teammates that the customer never sees. */
  internal: z.stringbool().default(false),
})

/**
 * Adds a message. The customer writing to a closed conversation reopens it. A teammate replying does not take the
 * conversation (assignment stays explicit) but it counts as reading it.
 */
export default defineEventHandler(async (event): Promise<ConversationMessageDTO> => {
  const user = await requireUser(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const { row, asCustomer } = await loadConversationToAct(user, id)
  const { files, text } = await readMultipart(event)
  const input = fields.parse({ body: text('body'), internal: text('internal') || undefined })
  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a message or attach a file' })
  if (asCustomer && input.internal) throw createError({ status: 403, message: 'Only the team can write internal notes' })

  const { message, dto } = await addConversationMessage(row, { authorId: user.id, body: input.body, internal: input.internal, files, uploaderId: user.id })

  const patch: Partial<typeof schema.conversations.$inferInsert> = {}
  // Internal notes do not move the conversation up the customer's list.
  if (!input.internal) patch.lastMessageAt = message.createdAt
  if (asCustomer && row.status === 'closed') Object.assign(patch, { status: 'open', closedAt: null })
  const updated = Object.keys(patch).length
    ? (await db.update(schema.conversations).set(patch).where(eq(schema.conversations.id, row.id)).returning())[0]!
    : row

  broadcastConversationMessage(event, updated, dto)
  // Writing counts as reading; a note is not something the customer should learn about.
  await markConversationRead(event, updated, user.id, new Date(message.createdAt), { tellCustomer: !input.internal })
  await broadcastConversation(event, updated)

  const snippet = firstLine(input.body || `${files.length} file${files.length === 1 ? '' : 's'}`, 80)
  if (asCustomer) {
    if (updated.assigneeId && updated.assigneeId !== user.id) {
      await notify(event, updated.assigneeId, {
        type: 'conversation',
        message: `${dto.authorName}${row.status === 'closed' ? ' reopened a conversation' : ''}: ${snippet}`,
        link: conversationLink(updated, false),
      })
    }
  } else if (input.internal) {
    if (updated.assigneeId && updated.assigneeId !== user.id) {
      await notify(event, updated.assigneeId, { type: 'conversation', message: `${dto.authorName} added a note: ${snippet}`, link: conversationLink(updated, false) })
    }
  } else if (updated.customerId !== user.id) {
    await notify(event, updated.customerId, { type: 'conversation', message: `Support replied: ${snippet}`, link: conversationLink(updated, true) })
  }
  return dto
})
