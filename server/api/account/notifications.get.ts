import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Notification settings: email copies (with the role default) and the browsers that receive push. */
export default defineEventHandler(async (event) => {
  const session = await requireMember(event)
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) })
  if (!user) throw createError({ status: 404, message: 'Account not found' })
  const browsers = await db
    .select({ id: schema.pushSubscriptions.id, userAgent: schema.pushSubscriptions.userAgent, createdAt: schema.pushSubscriptions.createdAt, lastSentAt: schema.pushSubscriptions.lastSentAt })
    .from(schema.pushSubscriptions)
    .where(eq(schema.pushSubscriptions.userId, user.id))
  const mail = await mailConfig(event)
  return {
    email: wantsEmail(user),
    emailIsDefault: user.emailNotifications === null,
    /** Whether this site can send email at all; otherwise the setting has no effect yet. */
    mailConfigured: mail.transport !== 'none' && !!mail.from,
    browsers,
  }
})
