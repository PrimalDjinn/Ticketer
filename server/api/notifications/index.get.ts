import { and, desc, eq, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  const user = await requireUser(event)
  const rows = await db
    .select()
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, user.id), isNull(schema.notifications.readAt)))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(50)
  return rows.map(toNotificationDTO)
})
