import type { H3Event } from 'h3'
import { z } from 'zod'

/**
 * Bot protection for the forms anyone can use without an account: sign-up, password reset, and opening a ticket or a
 * support chat as a visitor. Cloudflare Turnstile or Google reCAPTCHA (v2 checkbox), configured with
 * NUXT_CAPTCHA_PROVIDER / NUXT_CAPTCHA_SITE_KEY / NUXT_CAPTCHA_SECRET_KEY or in Settings → Bot protection; env wins
 * field by field. The browser sends the widget's token in the `x-captcha-token` header.
 */

const log = useLogger('captcha')

const VERIFY_URL: Record<CaptchaProvider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
  recaptcha: 'https://www.google.com/recaptcha/api/siteverify',
}

export const captchaSettingsShape = z.object({
  provider: z.enum(['none', ...CAPTCHA_PROVIDERS]).default('none'),
  siteKey: z.string().default(''),
  /** Encrypted with `encryptSecret`. */
  secretKey: z.string().default(''),
})

export interface CaptchaConfig {
  provider: CaptchaProvider | 'none'
  siteKey: string
  secretKey: string
  sources: Record<'provider' | 'siteKey' | 'secretKey', SettingSource>
  /** Why protection is configured but not working, for Settings. */
  problem: string | null
}

const envText = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim())

/** `decrypt: false` skips decrypting a stored secret key (it's only reported as present): enough to render the widget. */
export async function captchaConfig(event?: H3Event, options: { decrypt?: boolean } = {}): Promise<CaptchaConfig> {
  const env = (event ? useRuntimeConfig(event) : useRuntimeConfig()).captcha
  const stored = (await getSetting('captcha', captchaSettingsShape)) ?? captchaSettingsShape.parse({})

  const envProvider = envText(env.provider).toLowerCase()
  const parsedEnvProvider = (['none', ...CAPTCHA_PROVIDERS] as const).find((p) => p === envProvider)
  if (envProvider && !parsedEnvProvider) log.warn(`NUXT_CAPTCHA_PROVIDER="${envProvider}" is not turnstile, recaptcha or none; ignoring it`)
  const provider = parsedEnvProvider ?? stored.provider
  const providerSource: SettingSource = parsedEnvProvider ? 'env' : stored.provider !== 'none' ? 'settings' : 'unset'

  const envSite = envText(env.siteKey)
  const siteKey = envSite || stored.siteKey.trim()
  const siteKeySource: SettingSource = envSite ? 'env' : siteKey ? 'settings' : 'unset'

  let secretKey = envText(env.secretKey)
  let secretKeySource: SettingSource = secretKey ? 'env' : 'unset'
  let unreadable = false
  if (!secretKey && stored.secretKey) {
    secretKey = options.decrypt === false ? 'stored' : ((await decryptSecret(stored.secretKey)) ?? '')
    unreadable = !secretKey
    secretKeySource = 'settings'
  }

  let problem: string | null = null
  if (provider !== 'none') {
    if (!siteKey) problem = 'Add the site key'
    else if (unreadable) problem = 'The stored secret key cannot be read (was NUXT_APP_SECRET changed?). Enter it again.'
    else if (!secretKey) problem = 'Add the secret key'
  }
  return { provider, siteKey, secretKey, sources: { provider: providerSource, siteKey: siteKeySource, secretKey: secretKeySource }, problem }
}

/** What browsers need to show the widget; null when bot protection is off or incomplete (then nothing is checked). */
export async function publicCaptcha(event?: H3Event): Promise<{ provider: CaptchaProvider; siteKey: string } | null> {
  const config = await captchaConfig(event, { decrypt: false })
  if (config.provider === 'none' || config.problem) return null
  return { provider: config.provider, siteKey: config.siteKey }
}

/** Asks the provider whether a token is genuine. Never throws. */
export async function verifyCaptchaToken(
  event: H3Event,
  config: Pick<CaptchaConfig, 'provider' | 'secretKey'>,
  token: string,
): Promise<{ ok: true } | { ok: false; reason: string; unavailable?: boolean }> {
  if (config.provider === 'none') return { ok: true }
  const form = new URLSearchParams({ secret: config.secretKey, response: token })
  const ip = getRequestIP(event, { xForwardedFor: true })
  if (ip) form.set('remoteip', ip)
  try {
    const response = await fetch(VERIFY_URL[config.provider], { method: 'POST', body: form, signal: AbortSignal.timeout(8000) })
    const result = (await response.json().catch(() => null)) as { success?: boolean; 'error-codes'?: string[] } | null
    if (result?.success) return { ok: true }
    const codes = result?.['error-codes'] ?? [`http-${response.status}`]
    // Codes that mean our configuration is wrong, not the visitor.
    if (codes.some((c) => /secret|sitekey|bad-request|internal-error/i.test(c))) {
      log.error('the provider rejected the configuration', { provider: config.provider, codes })
      return { ok: false, reason: codes.join(', '), unavailable: true }
    }
    return { ok: false, reason: codes.join(', ') }
  } catch (error) {
    log.warn('could not reach the provider', { provider: config.provider, error: error instanceof Error ? error.message : String(error) })
    return { ok: false, reason: 'unreachable', unavailable: true }
  }
}

/**
 * Throws unless the request carries a valid token, when bot protection is on. Fails closed: a misconfiguration or an
 * unreachable provider blocks the form (with a message saying so) rather than letting bots through.
 */
export async function requireCaptcha(event: H3Event) {
  const config = await captchaConfig(event)
  if (config.provider === 'none' || config.problem) return
  const token = getHeader(event, CAPTCHA_HEADER)?.trim()
  if (!token) throw createError({ status: 400, message: 'Complete the “I’m not a robot” check first', data: { captcha: true } })
  if (token.length > 4096) throw createError({ status: 400, message: 'Invalid verification token', data: { captcha: true } })
  const result = await verifyCaptchaToken(event, config, token)
  if (result.ok) return
  if (result.unavailable) {
    throw createError({ status: 503, message: 'The robot check is unavailable right now. Try again in a minute.', data: { captcha: true } })
  }
  throw createError({ status: 400, message: 'The robot check expired or failed. Try it again.', data: { captcha: true } })
}
