import { and, count, desc, eq, gt, inArray, sql } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Fewer measured replies than this and we don't claim a typical reply time. */
const MIN_SAMPLE = 5
const WINDOW_DAYS = 30

/**
 * How quickly the team answers support chats: the median time from a conversation starting to the team's first
 * reply (internal notes don't count), over conversations started in the last 30 days that got a reply.
 */
export async function replyTime() {
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000)
  const c = schema.conversations
  const m = schema.conversationMessages
  const u = schema.users
  const rows = await db
    .select({ started: c.createdAt, firstReply: sql<number>`min(${m.createdAt})` })
    .from(c)
    .innerJoin(m, and(eq(m.conversationId, c.id), eq(m.internal, false)))
    .innerJoin(u, eq(u.id, m.authorId))
    .where(and(gt(c.createdAt, since), eq(u.isGuest, false), inArray(u.role, [...INTERNAL_ROLES])))
    .groupBy(c.id)
  const minutes = rows
    .map((r) => (Number(r.firstReply) - new Date(r.started).getTime()) / 60_000)
    .filter((v) => Number.isFinite(v) && v >= 0)
    .sort((a, b) => a - b)
  if (minutes.length < MIN_SAMPLE) return { minutes: null, sample: minutes.length, text: null }
  const mid = Math.floor(minutes.length / 2)
  const median = minutes.length % 2 ? minutes[mid]! : (minutes[mid - 1]! + minutes[mid]!) / 2
  return { minutes: Math.round(median), sample: minutes.length, text: describeReplyTime(median) }
}

/** "Usually replies within minutes", "… in about 20 minutes", "… in about 3 hours", "… within a day". */
export function describeReplyTime(minutes: number) {
  if (minutes < 5) return 'Usually replies within minutes'
  if (minutes < 55) return `Usually replies in about ${Math.max(5, Math.round(minutes / 5) * 5)} minutes`
  const hours = Math.round(minutes / 60)
  if (hours <= 1) return 'Usually replies in about an hour'
  if (hours < 20) return `Usually replies in about ${hours} hours`
  if (hours < 36) return 'Usually replies within a day'
  return 'Usually replies within a few days'
}

/** Public status: open public issues and the latest few, for the public home and the issues page. */
export async function publicStatus() {
  const t = schema.tickets
  const active = and(eq(t.visibility, 'public'), inArray(t.status, ['Open', 'Pending']))
  const [[open], [urgent], latest] = await Promise.all([
    db.select({ value: count() }).from(t).where(active),
    db.select({ value: count() }).from(t).where(and(active, inArray(t.urgency, ['Urgent', 'Emergency']))),
    db
      .select({ reference: t.reference, title: t.title, info: t.info, status: t.status, urgency: t.urgency, updatedAt: t.updatedAt, createdAt: t.createdAt })
      .from(t)
      .where(active)
      .orderBy(desc(sql`coalesce(${t.updatedAt}, ${t.createdAt})`))
      .limit(5),
  ])
  return {
    open: open?.value ?? 0,
    urgent: (urgent?.value ?? 0) > 0,
    latest: latest.map((r) => ({
      reference: r.reference,
      title: ticketTitle(r),
      status: r.status,
      urgency: r.urgency,
      updatedAt: r.updatedAt ?? r.createdAt,
    })),
  }
}
