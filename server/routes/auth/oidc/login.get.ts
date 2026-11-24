import { z } from 'zod'

const query = z.object({ redirect: z.string().max(2000).optional() })

/** Starts single sign-on: `GET /auth/oidc/login?redirect=/path` sends the browser to the identity provider. */
export default defineEventHandler(async (event) => {
  const { redirect } = await getValidatedQuery(event, query.parse)
  try {
    return sendRedirect(event, await beginOidcLogin(event, safeRedirect(redirect)), 302)
  } catch (error) {
    const code = error instanceof OidcError ? error.code : 'failed'
    useLogger('oidc').error('could not start single sign-on', error instanceof Error ? error.message : error)
    return sendRedirect(event, loginErrorUrl(code, redirect), 302)
  }
})
