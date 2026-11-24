import { z } from 'zod'

const params = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) })

/** A single-use login link from `POST /api/integrations/v1/sessions`: signs the person in and opens the target. */
export default defineEventHandler(async (event) => {
  const log = useLogger('integrations')
  setResponseHeader(event, 'cache-control', 'no-store')
  setResponseHeader(event, 'referrer-policy', 'no-referrer')
  const parsed = await getValidatedRouterParams(event, (value) => params.safeParse(value))
  if (!parsed.success) return sendRedirect(event, '/auth/login?error=launch_invalid', 302)

  const result = await redeemLoginLink(parsed.data.token)
  if (!result.ok) {
    log.warn('login link refused', { reason: result.reason })
    return sendRedirect(event, `/auth/login?error=launch_${result.reason}`, 302)
  }
  await startSession(event, result.user)
  if (result.app) setBackLink(event, result.app, result.returnUrl)
  log.info('signed in with a login link', { appId: result.app?.id, userId: result.user.id, target: result.target })
  return sendRedirect(event, result.target, 302)
})
