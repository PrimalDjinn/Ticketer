import { z } from 'zod'

const text = (max: number) => z.string().trim().max(max)
const roleGroupsText = text(2000).refine(
  (value) =>
    value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .every((part) => /^(admin|member|viewer|external):.+$/i.test(part)),
  'Use role:group pairs separated by commas, e.g. admin:ticketer-admins,member:staff',
)

const body = z.object({
  enabled: z.boolean().optional(),
  issuer: text(500)
    .refine((v) => !v || isAllowedIssuer(v), 'The issuer must be an https:// URL')
    .optional(),
  clientId: text(500).optional(),
  /** A new secret; leave out to keep the current one. */
  clientSecret: z.string().max(2000).optional(),
  clearClientSecret: z.boolean().optional(),
  name: text(60).optional(),
  scopes: text(500).optional(),
  defaultRole: z.enum(OIDC_DEFAULT_ROLES).optional(),
  groupsClaim: text(200).optional(),
  roleGroups: roleGroupsText.optional(),
  only: z.boolean().optional(),
})

const FIELDS = ['enabled', 'issuer', 'clientId', 'clientSecret', 'name', 'scopes', 'defaultRole', 'groupsClaim', 'roleGroups', 'only'] as const

/** Updates the stored single sign-on settings. Fields pinned by NUXT_OIDC_* env vars cannot be changed here. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const config = await oidcConfig(event)

  const touched = FIELDS.filter((key) => input[key] !== undefined || (key === 'clientSecret' && input.clearClientSecret))
  const pinned = touched.filter((key) => config.sources[key] === 'env')
  if (pinned.length) {
    throw createError({ status: 409, message: `Set by the server environment: ${pinned.map((key) => ENV_NAMES[key]).join(', ')}` })
  }

  const current = (await readOidcSettings()) ?? oidcSettingsShape.parse({})
  const next = { ...current }
  for (const key of ['issuer', 'clientId', 'name', 'scopes', 'groupsClaim', 'roleGroups'] as const) {
    const value = input[key]
    if (value !== undefined) next[key] = value
  }
  if (input.enabled !== undefined) next.enabled = input.enabled
  if (input.only !== undefined) next.only = input.only
  if (input.defaultRole !== undefined) next.defaultRole = input.defaultRole
  if (input.clearClientSecret) next.clientSecret = ''
  if (input.clientSecret?.trim()) next.clientSecret = await encryptSecret(input.clientSecret.trim())

  // Turning it on needs the essentials (from env or here).
  const issuer = config.sources.issuer === 'env' ? config.issuer : next.issuer
  const clientId = config.sources.clientId === 'env' ? config.clientId : next.clientId
  if (next.enabled && config.sources.enabled !== 'env') {
    if (!issuer || !clientId) throw createError({ status: 400, message: 'Enter the issuer URL and client ID before turning single sign-on on' })
  }

  // "Single sign-on only" only makes sense while single sign-on works: refuse it otherwise, and turning single
  // sign-on off clears it, so it can't silently lock passwords out later when SSO is turned back on.
  const enabledAfter = config.sources.enabled === 'env' ? config.enabled : next.enabled
  if (!enabledAfter && input.only === undefined) next.only = false
  if (next.only && input.only === true && !(enabledAfter && issuer && clientId)) {
    throw createError({ status: 400, message: 'Turn single sign-on on, save and test it before making it the only way in' })
  }

  await setSetting('oidc', next)
  useLogger('settings').info('single sign-on settings changed', {
    by: admin.id,
    fields: touched,
    enabled: next.enabled,
    only: next.only,
  })
  return oidcSettingsDTO(event)
})
