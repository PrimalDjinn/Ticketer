import { z } from 'zod'

const body = z.object({ to: z.email('Enter a valid email').trim() })

/** Sends a test message with the current mail setup and reports the transport's error, if any. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { to } = await readValidatedBody(event, body.parse)
  await sendMail(event, { to, subject: `${brandName(await readBranding(), event)} test email`, ...(await testMail()) }, { throwErrors: true })
  useLogger('settings').info('test email sent', { by: admin.id })
  return { ok: true }
})
