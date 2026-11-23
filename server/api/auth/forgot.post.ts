import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ email: z.string().trim().toLowerCase() })

export default defineEventHandler(async (event) => {
  const { email } = await readValidatedBody(event, body.parse)
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) })

  // Always answer the same way so the endpoint cannot be used to discover accounts.
  if (user && !user.isGuest) {
    const token = randomToken()
    await db.insert(schema.passwordResets).values({
      userId: user.id,
      tokenHash: await sha256(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    })
    const link = `${getRequestURL(event).origin}/auth/reset/${token}`
    const sending = sendMail(event, { to: email, subject: 'Reset your Ticketer password', ...passwordResetMail(link) }).catch(
      (error) => console.error('[mail] password reset failed', error),
    )
    event.waitUntil(sending)
  }
  return { ok: true }
})
