import { z } from 'zod'

const query = z.object({
  code: z.string().max(4096).optional(),
  state: z.string().max(512).optional(),
  error: z.string().max(200).optional(),
  error_description: z.string().max(1000).optional(),
  iss: z.string().max(1000).optional(),
})

/** The identity provider sends the browser back here (register this URL as the redirect URI). */
export default defineEventHandler(async (event) => {
  const log = useLogger('oidc')
  const input = await getValidatedQuery(event, query.parse)
  let redirect = '/'
  try {
    const result = await completeOidcLogin(event, input)
    redirect = result.redirect
    const user = await signInWithOidc(event, result.profile, result.config)
    await startSession(event, user)
    log.info('signed in with single sign-on', { userId: user.id, role: user.role })
    return sendRedirect(event, safeRedirect(redirect), 302)
  } catch (error) {
    const code = error instanceof OidcError ? error.code : 'failed'
    if (error instanceof OidcError && error.code !== 'failed') log.warn(`single sign-on refused (${error.code}): ${error.message}`)
    else log.error('single sign-on failed', error instanceof Error ? error.message : error)
    return sendRedirect(event, loginErrorUrl(code, redirect), 302)
  }
})
