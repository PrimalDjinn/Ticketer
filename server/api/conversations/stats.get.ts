import { and, count, eq, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Inbox counters for the team: sidebar badge, home dashboard and the chat button. */
export default defineEventHandler(async (event): Promise<ConversationStats> => {
  const user = await requireInternal(event)
  const c = schema.conversations
  const open = eq(c.status, 'open')
  const [[all], [unassigned], [mine], openRows] = await Promise.all([
    db.select({ n: count() }).from(c).where(open),
    db.select({ n: count() }).from(c).where(and(open, isNull(c.assigneeId))),
    db.select({ n: count() }).from(c).where(and(open, eq(c.assigneeId, user.id))),
    db.select({ id: c.id }).from(c).where(open),
  ])
  const unread = await unreadCounts(openRows.map((r) => r.id), user.id, false)
  return { open: all?.n ?? 0, unassigned: unassigned?.n ?? 0, mine: mine?.n ?? 0, unread: [...unread.values()].filter((n) => n > 0).length }
})
