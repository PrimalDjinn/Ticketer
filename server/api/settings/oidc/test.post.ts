import { z } from 'zod'

const body = z.object({ issuer: z.string().trim().max(500).optional() })

/** "Test connection": fetches the provider's discovery document and key set (for the given or the saved issuer). */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, (value) => body.parse(value ?? {}))
  const config = await oidcConfig(event)
  // An env-pinned issuer is always the one tested.
  const issuer = config.sources.issuer === 'env' ? config.issuer : input.issuer || config.issuer
  const result = await testOidcIssuer(issuer)
  useLogger('oidc').info('connection test', { issuer, ok: result.ok })
  return result
})
