import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * The signed-in user's conversations, newest first, with the latest messages of each. Every admin is listed even
 * without history so anyone (guests included) can start a support chat.
 */
export default defineEventHandler(async (event): Promise<ChatDTO[]> => {
  const user = await requireUser(event)
  const c = schema.chats
  const rows = await db
    .select()
    .from(c)
    .where(or(eq(c.userA, user.id), eq(c.userB, user.id)))
    .orderBy(desc(c.lastMessageAt))

  const partnerIds = rows.map((r) => otherParty(r, user.id))
  const admins = await db.select().from(schema.users).where(and(eq(schema.users.isAdmin, true), ne(schema.users.id, user.id)))
  const partners = new Map(
    (partnerIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, partnerIds)) : []).map((u) => [u.id, u]),
  )

  const recent = rows.length
    ? await db
        .select()
        .from(schema.messages)
        .where(inArray(schema.messages.chatId, rows.map((r) => r.id)))
        .orderBy(asc(schema.messages.createdAt))
    : []
  // Keep the payload small: the last 50 messages per chat; older ones load on demand.
  const byChat = new Map<string, (typeof recent)[number][]>()
  for (const m of recent) {
    const list = byChat.get(m.chatId) ?? []
    list.push(m)
    if (list.length > 50) list.shift()
    byChat.set(m.chatId, list)
  }
  const dtos = await toMessageDTOs([...byChat.values()].flat())
  const dtoByChat = new Map<string, MessageDTO[]>()
  for (const d of dtos) dtoByChat.set(d.chatId, [...(dtoByChat.get(d.chatId) ?? []), d])

  const result: ChatDTO[] = rows.flatMap((r) => {
    const partner = partners.get(otherParty(r, user.id))
    if (!partner) return []
    return [{ id: r.id, with: toPublicUser(partner), messages: dtoByChat.get(r.id) ?? [], lastMessageAt: r.lastMessageAt }]
  })
  for (const admin of admins) {
    if (!partners.has(admin.id)) {
      result.push({ id: chatIdFor(user.id, admin.id), with: toPublicUser(admin), messages: [], lastMessageAt: null })
    }
  }
  return result
})
