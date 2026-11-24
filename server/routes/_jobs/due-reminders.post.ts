import { lt } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Internal: called in-process by the hourly `reminders:due` scheduled task. Not reachable from outside (see that task). */
export default defineEventHandler(async (event) => {
  if (event.context.scheduledJob !== true) throw createError({ status: 404, message: 'Not found' })
  // Housekeeping: GitHub redelivers within days at most, so a week of delivery ids is plenty.
  await db.delete(schema.githubDeliveries).where(lt(schema.githubDeliveries.receivedAt, new Date(Date.now() - 7 * 86_400_000)))
  return sendDueReminders(event)
})
