import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({ body: conversationMessageBody, subject: conversationSubject.optional() })

/**
 * Starts a support conversation. Visitors without a session get a guest account on the way (they keep the
 * conversation if they register later). People on the team talk to each other in direct messages instead.
 */
export default defineEventHandler(async (event): Promise<ConversationDetailDTO> => {
  const { files, text } = await readMultipart(event)
  const input = fields.parse({ body: text('body'), subject: text('subject') })
  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a message or attach a file' })

  const user = await withFreshRole(await ensureUser(event))
  if (user.isInternal) throw createError({ status: 400, message: 'You are on the team: use direct messages to talk to teammates' })

  const now = new Date()
  const [row] = await db
    .insert(schema.conversations)
    .values({ customerId: user.id, subject: input.subject ?? null, status: 'open', createdAt: now, lastMessageAt: now })
    .returning()
  try {
    await addConversationMessage(row!, { authorId: user.id, body: input.body, internal: false, files, uploaderId: user.id, at: now })
  } catch (error) {
    await db.delete(schema.conversations).where(eq(schema.conversations.id, row!.id))
    throw error
  }

  const fresh = (await db.query.conversations.findFirst({ where: eq(schema.conversations.id, row!.id) }))!
  await markConversationRead(event, fresh, user.id, new Date())
  await broadcastConversation(event, fresh)
  const detail = await conversationDetail(fresh, { id: user.id, asCustomer: true })
  for (const message of detail.messages) broadcastConversationMessage(event, fresh, message)

  const name = displayName({ id: user.id, name: user.isGuest ? null : user.name })
  await notify(event, (await adminIds()).filter((id) => id !== user.id), {
    type: 'conversation',
    message: `${name} started a conversation${fresh.subject ? `: ${firstLine(fresh.subject, 80)}` : ''}`,
    link: conversationLink(fresh, false),
  })
  return detail
})
