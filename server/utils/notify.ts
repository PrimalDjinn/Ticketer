import type { H3Event } from 'h3'
import { and, eq, gt, inArray, isNotNull, like, ne, or } from 'drizzle-orm'
import { db, schema } from 'hub:db'

const log = useLogger('notify')

/** At most one email per person and link in this window, so a lively thread doesn't flood an inbox. */
const EMAIL_QUIET_MS = 10 * 60 * 1000

export function toNotificationDTO(n: typeof schema.notifications.$inferSelect): NotificationDTO {
  return { id: n.id, type: n.type, message: n.message, link: n.link, readAt: n.readAt, createdAt: n.createdAt }
}

/** Whether a person gets notification emails: their choice, else on for people outside the team and off for the team. */
export function wantsEmail(user: { emailNotifications: boolean | null; role: UserRole; isGuest: boolean }) {
  return user.emailNotifications ?? !isInternal(user)
}

/**
 * Stores a notification and delivers it: live to open tabs (realtime), and — for when no tab is open — as a Web Push
 * message to the person's subscribed browsers and, if they want it, by email. Push and email run after the response.
 */
export async function notify(event: H3Event, userIds: string | string[], data: { type: string; message: string; link?: string }) {
  const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])]
  if (!ids.length) return
  const rows = await db
    .insert(schema.notifications)
    .values(ids.map((userId) => ({ userId, type: data.type, message: data.message, link: data.link ?? null })))
    .returning()
  for (const row of rows) {
    publish(event, channels.user(row.userId), { type: 'notification', body: toNotificationDTO(row) })
  }
  event.waitUntil(
    deliverAway(event, rows).catch((error) => log.error('delivery failed', error instanceof Error ? error.message : String(error))),
  )
}

async function deliverAway(event: H3Event, rows: (typeof schema.notifications.$inferSelect)[]) {
  const userIds = rows.map((r) => r.userId)
  const [subscriptions, people] = await Promise.all([
    db.select().from(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, userIds)),
    db
      .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role, isGuest: schema.users.isGuest, emailNotifications: schema.users.emailNotifications })
      .from(schema.users)
      .where(inArray(schema.users.id, userIds)),
  ])
  const origin = siteOrigin(event)
  const appName = useRuntimeConfig(event).public.appName || 'Ticketer'

  // Web Push
  const gone: number[] = []
  await Promise.all(
    subscriptions.map(async (sub) => {
      const row = rows.find((r) => r.userId === sub.userId)!
      const result = await sendPush(sub, { title: appName, body: row.message, link: row.link, tag: row.link ?? `n${row.id}` }, { subject: origin })
      if (result === 'gone') gone.push(sub.id)
      else if (result === 'sent') await db.update(schema.pushSubscriptions).set({ lastSentAt: new Date() }).where(eq(schema.pushSubscriptions.id, sub.id))
    }),
  )
  if (gone.length) await db.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.id, gone))

  // Email
  for (const row of rows) {
    const person = people.find((p) => p.id === row.userId)
    if (!person?.email || person.isGuest || !wantsEmail(person)) continue
    if (row.link) {
      // Same page, whatever the anchor (each reply links to `#comment-<id>`).
      const page = row.link.split('#')[0]!
      const recent = await db.query.notifications.findFirst({
        where: and(
          eq(schema.notifications.userId, row.userId),
          or(eq(schema.notifications.link, page), like(schema.notifications.link, `${page}#%`)),
          ne(schema.notifications.id, row.id),
          isNotNull(schema.notifications.emailedAt),
          gt(schema.notifications.emailedAt, new Date(Date.now() - EMAIL_QUIET_MS)),
        ),
        columns: { id: true },
      })
      if (recent) continue
    }
    const url = `${origin}${row.link ?? '/'}`
    const sent = await sendMail(event, { to: person.email, subject: row.message.slice(0, 120), ...notificationMail(row.message, url, `${origin}/account`) }).catch(() => false)
    if (sent) await db.update(schema.notifications).set({ emailedAt: new Date() }).where(eq(schema.notifications.id, row.id))
  }
}

export async function adminIds() {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, 'admin'))
  return rows.map((r) => r.id)
}
