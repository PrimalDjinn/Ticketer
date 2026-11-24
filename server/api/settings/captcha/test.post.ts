import { z } from 'zod'

const body = z.object({ token: z.string().min(1).max(4096) })

/** Checks a token from the widget on the settings page against the saved secret key: proves the two keys match. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { token } = await readValidatedBody(event, body.parse)
  const config = await captchaConfig(event)
  if (config.provider === 'none') throw createError({ status: 400, message: 'Choose a provider and save first' })
  if (config.problem) throw createError({ status: 400, message: config.problem })
  const result = await verifyCaptchaToken(event, config, token)
  if (!result.ok) throw createError({ status: 400, message: result.unavailable ? `The provider rejected the keys (${result.reason}). Check that the site key and secret key belong together.` : `Verification failed (${result.reason})` })
  return { ok: true }
})
