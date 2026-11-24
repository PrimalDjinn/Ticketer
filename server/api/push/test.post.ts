import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Sends a test notification to every browser the signed-in person turned push on in. */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const subs = await db.select().from(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.userId, user.id))
  if (!subs.length) throw createError({ status: 400, message: 'Push notifications are not on in any browser yet' })
  const appName = useRuntimeConfig(event).public.appName || 'Ticketer'
  const results = await Promise.all(
    subs.map((sub) => sendPush(sub, { title: appName, body: 'Push notifications work.', link: '/account', tag: 'test' }, { subject: siteOrigin(event) })),
  )
  const gone = subs.filter((_, i) => results[i] === 'gone').map((s) => s.id)
  for (const id of gone) await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.id, id))
  return { sent: results.filter((r) => r === 'sent').length, failed: results.filter((r) => r === 'failed').length, removed: gone.length }
})
