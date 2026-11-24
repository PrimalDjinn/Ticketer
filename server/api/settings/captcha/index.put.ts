import { z } from 'zod'

const body = z.object({
  provider: z.enum(['none', ...CAPTCHA_PROVIDERS]),
  siteKey: z.string().trim().max(200),
  /** A new secret key; leave out to keep the current one, null to remove it. */
  secretKey: z.string().trim().max(200).nullable().optional(),
})

const ENV_NAMES = { provider: 'NUXT_CAPTCHA_PROVIDER', siteKey: 'NUXT_CAPTCHA_SITE_KEY', secretKey: 'NUXT_CAPTCHA_SECRET_KEY' } as const

/** Stores the bot-protection settings. Fields set by NUXT_CAPTCHA_* environment variables are kept as they are. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const config = await captchaConfig(event)
  const current = (await getSetting('captcha', captchaSettingsShape)) ?? captchaSettingsShape.parse({})

  const next = { ...current }
  if (config.sources.provider !== 'env') next.provider = input.provider
  if (config.sources.siteKey !== 'env') next.siteKey = input.siteKey
  if (config.sources.secretKey !== 'env' && input.secretKey !== undefined) next.secretKey = input.secretKey ? await encryptSecret(input.secretKey) : ''
  await setSetting('captcha', next)
  useLogger('settings').info('bot protection changed', { provider: next.provider, pinned: Object.entries(config.sources).filter(([, s]) => s === 'env').map(([k]) => ENV_NAMES[k as keyof typeof ENV_NAMES]) })
  return { ok: true }
})
