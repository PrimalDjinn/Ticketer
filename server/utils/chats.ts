import type { schema } from 'hub:db'

export function chatIdFor(a: string, b: string) {
  return [a, b].sort().join(':')
}

export function otherParty(chat: { userA: string; userB: string }, me: string) {
  return chat.userA === me ? chat.userB : chat.userA
}

export async function toMessageDTOs(rows: (typeof schema.messages.$inferSelect)[]): Promise<MessageDTO[]> {
  const files = await attachmentsFor('messageId', rows.map((r) => r.id))
  return rows.map((m) => ({
    id: m.id,
    chatId: m.chatId,
    fromId: m.fromId,
    toId: m.toId,
    body: m.body,
    readAt: m.readAt,
    createdAt: m.createdAt,
    attachments: files.get(m.id) ?? [],
  }))
}

