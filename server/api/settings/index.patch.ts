import { z } from 'zod'

const body = z.object({ signup: z.enum(SIGNUP_MODES) })

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { signup } = await readValidatedBody(event, body.parse)
  await setSignupMode(signup)
  useLogger('settings').info('sign-up mode changed', { signup })
  return { signup }
})
