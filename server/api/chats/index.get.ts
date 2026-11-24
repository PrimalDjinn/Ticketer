import { and, asc, desc, eq, inArray, ne, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * Direct messages between people on the team, newest first, with the latest messages of each. Every teammate is
 * listed even without history so anyone can start a conversation. People outside the team use support conversations.
 */
export default defineEventHandler(async (event): Promise<ChatDTO[]> => {
  const user = await requireInternal(event)
  const c = schema.chats
  const rows = await db
    .select()
    .from(c)
    .where(or(eq(c.userA, user.id), eq(c.userB, user.id)))
    .orderBy(desc(c.lastMessageAt))

  const partnerIds = rows.map((r) => otherParty(r, user.id))
  const u = schema.users
  const teammates = await db
    .select()
    .from(u)
    .where(and(eq(u.isGuest, false), inArray(u.role, [...INTERNAL_ROLES]), ne(u.id, user.id)))
    .orderBy(asc(u.name))
  // Only chats with people still on the team (old support chats with outsiders moved to conversations).
  const partners = new Map(teammates.filter((t) => partnerIds.includes(t.id)).map((t) => [t.id, t]))
  const chatRows = rows.filter((r) => partners.has(otherParty(r, user.id)))

  const recent = chatRows.length
    ? await db
        .select()
        .from(schema.messages)
        .where(inArray(schema.messages.chatId, chatRows.map((r) => r.id)))
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

  const result: ChatDTO[] = chatRows.flatMap((r) => {
    const partner = partners.get(otherParty(r, user.id))
    if (!partner) return []
    return [{ id: r.id, with: toPublicUser(partner), messages: dtoByChat.get(r.id) ?? [], lastMessageAt: r.lastMessageAt }]
  })
  for (const mate of teammates) {
    if (!partners.has(mate.id)) {
      result.push({ id: chatIdFor(user.id, mate.id), with: toPublicUser(mate), messages: [], lastMessageAt: null })
    }
  }
  return result
})
