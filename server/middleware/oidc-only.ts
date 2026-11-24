import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const PASSWORD_ROUTES = new Set(['/api/auth/register', '/api/auth/forgot', '/api/auth/reset', '/api/auth/login'])
const loginBody = z.looseObject({ email: z.string().trim().toLowerCase() })

/**
 * SSO-only mode (NUXT_OIDC_ONLY or Settings → Sign-in): password sign-up and reset are off, and password sign-in is
 * kept only for admins, as a break-glass when the identity provider is down (`/auth/login?password`). The env admin
 * and `pnpm admin` keep working that way.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'POST') return
  const path = event.path.split('?')[0]!.replace(/\/+$/, '')
  if (!PASSWORD_ROUTES.has(path)) return
  const config = await oidcConfig(event)
  if (!config.only) return

  if (path === '/api/auth/login') {
    const body = loginBody.safeParse(await readBody(event).catch(() => null))
    const user = body.success ? await db.query.users.findFirst({ where: eq(schema.users.email, body.data.email), columns: { role: true, isGuest: true } }) : null
    if (user?.role === 'admin' && !user.isGuest) return
    throw createError({ status: 403, message: `Sign in with ${config.name}` })
  }
  throw createError({ status: 403, message: `Accounts are managed through ${config.name}` })
})
