import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export function toNotificationDTO(n: typeof schema.notifications.$inferSelect): NotificationDTO {
  return { id: n.id, type: n.type, message: n.message, link: n.link, readAt: n.readAt, createdAt: n.createdAt }
}

/** Stores a notification and pushes it to the recipient's open connections. */
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
}

export async function adminIds() {
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.isAdmin, true))
  return rows.map((r) => r.id)
}
