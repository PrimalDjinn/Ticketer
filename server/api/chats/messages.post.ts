import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const fields = z.object({
  to: z.string().min(1).max(64),
  body: z.string().trim().max(10_000).default(''),
})

export default defineEventHandler(async (event) => {
  const user = await ensureUser(event)
  const { files, text } = await readMultipart(event)
  const input = fields.parse({ to: text('to'), body: text('body') })
  if (!input.body && !files.length) throw createError({ status: 400, message: 'Write a message or attach a file' })
  if (input.to === user.id) throw createError({ status: 400, message: 'You cannot message yourself' })

  const recipient = await db.query.users.findFirst({ where: eq(schema.users.id, input.to) })
  if (!recipient) throw createError({ status: 404, message: 'That person no longer exists' })
  // Guests and regular users talk to support; only admins can start conversations with anyone.
  if (recipient.role !== 'admin' && !user.isAdmin) {
    const existing = await db.query.chats.findFirst({ where: eq(schema.chats.id, chatIdFor(user.id, recipient.id)) })
    if (!existing) throw createError({ status: 403, message: 'You can only message support' })
  }

  const chatId = chatIdFor(user.id, recipient.id)
  const now = new Date()
  const [userA, userB] = [user.id, recipient.id].sort() as [string, string]
  await db
    .insert(schema.chats)
    .values({ id: chatId, userA, userB, lastMessageAt: now })
    .onConflictDoUpdate({ target: schema.chats.id, set: { lastMessageAt: now } })

  const [message] = await db.insert(schema.messages).values({ chatId, fromId: user.id, toId: recipient.id, body: input.body }).returning()
  try {
    await storeAttachments(`chats/${chatId.replace(':', '-')}`, files, { messageId: message!.id }, user.id)
  } catch (error) {
    await db.delete(schema.messages).where(eq(schema.messages.id, message!.id))
    throw error
  }

  const [dto] = await toMessageDTOs([message!])
  publish(event, [channels.user(user.id), channels.user(recipient.id)], { type: 'message.created', body: dto! })
  return dto
})
