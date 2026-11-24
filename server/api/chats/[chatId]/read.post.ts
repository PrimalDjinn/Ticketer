import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const user = await requireInternal(event)
  const { chatId } = await getValidatedRouterParams(event, chatParams.parse)
  const chat = await db.query.chats.findFirst({ where: eq(schema.chats.id, chatId) })
  if (!chat || (chat.userA !== user.id && chat.userB !== user.id)) return { ok: true }

  await db
    .update(schema.messages)
    .set({ readAt: new Date() })
    .where(and(eq(schema.messages.chatId, chatId), eq(schema.messages.toId, user.id), isNull(schema.messages.readAt)))
  publish(event, channels.user(otherParty(chat, user.id)), { type: 'messages.read', body: { chatId, readerId: user.id } })
  return { ok: true }
})
