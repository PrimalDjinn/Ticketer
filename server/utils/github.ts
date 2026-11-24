/**
 * GitHub App client, WebCrypto only (Node and Workers): configuration, the app's JWT, installation tokens, REST calls
 * and webhook signatures. The sync itself is in github-sync.ts.
 *
 * Configuration comes from NUXT_GITHUB_* (field by field) or Settings → GitHub, where the app is usually created with
 * GitHub's app-manifest flow; the private key and webhook secret are stored encrypted.
 */
import type { H3Event } from 'h3'
import { deriveSecret } from 'nuxt/server'
import { z } from 'zod'

const log = useLogger('github')

export const githubSettingsShape = z.object({
  appId: z.string().default(''),
  slug: z.string().default(''),
  /** Encrypted with `encryptSecret`. */
  privateKey: z.string().default(''),
  /** Encrypted with `encryptSecret`. */
  webhookSecret: z.string().default(''),
  /** Account that owns the app, for links. */
  owner: z.string().default(''),
  htmlUrl: z.string().default(''),
})

export interface GithubConfig {
  appId: string
  slug: string
  privateKey: string
  webhookSecret: string
  owner: string
  htmlUrl: string
  apiUrl: string
  webUrl: string
  sources: Record<'appId' | 'slug' | 'privateKey' | 'webhookSecret', SettingSource>
  /** What's missing or broken, for Settings; null when the app can be used. */
  problem: string | null
}

const envText = (value: unknown) => (value === undefined || value === null ? '' : String(value).trim())

export async function githubConfig(event?: H3Event, options: { decrypt?: boolean } = {}): Promise<GithubConfig> {
  const env = (event ? useRuntimeConfig(event) : useRuntimeConfig()).github
  const stored = (await getSetting('github', githubSettingsShape)) ?? githubSettingsShape.parse({})
  const pick = (envValue: unknown, storedValue: string): [string, SettingSource] => {
    const fromEnv = envText(envValue)
    if (fromEnv) return [fromEnv, 'env']
    return storedValue ? [storedValue, 'settings'] : ['', 'unset']
  }
  const secret = async (envValue: unknown, storedValue: string): Promise<[string, SettingSource, boolean]> => {
    const fromEnv = envText(envValue).replace(/\\n/g, '\n')
    if (fromEnv) return [fromEnv, 'env', false]
    if (!storedValue) return ['', 'unset', false]
    if (options.decrypt === false) return ['stored', 'settings', false]
    const plain = await decryptSecret(storedValue)
    return [plain ?? '', 'settings', !plain]
  }
  const [appId, appIdSource] = pick(env.appId, stored.appId)
  const [slug, slugSource] = pick(env.appSlug, stored.slug)
  const [privateKey, keySource, keyUnreadable] = await secret(env.privateKey, stored.privateKey)
  const [webhookSecret, hookSource, hookUnreadable] = await secret(env.webhookSecret, stored.webhookSecret)

  let problem: string | null = null
  if (!appId) problem = 'No GitHub App yet'
  else if (!slug) problem = 'Add the app’s URL name (slug)'
  else if (keyUnreadable || hookUnreadable) problem = 'The stored keys cannot be read (was NUXT_APP_SECRET changed?). Enter them again or create a new app.'
  else if (!privateKey) problem = 'Add the app’s private key'
  else if (!webhookSecret) problem = 'Add the webhook secret'

  return {
    appId,
    slug,
    privateKey,
    webhookSecret,
    owner: stored.owner,
    htmlUrl: stored.htmlUrl,
    apiUrl: (envText(env.apiUrl) || 'https://api.github.com').replace(/\/+$/, ''),
    webUrl: (envText(env.webUrl) || 'https://github.com').replace(/\/+$/, ''),
    sources: { appId: appIdSource, slug: slugSource, privateKey: keySource, webhookSecret: hookSource },
    problem,
  }
}

/** The configuration, or a 409 explaining what's missing. */
export async function requireGithubConfig(event?: H3Event) {
  const config = await githubConfig(event)
  if (config.problem) throw createError({ status: 409, message: `GitHub isn’t set up: ${config.problem}. See Settings → GitHub.` })
  return config
}

// ---------------------------------------------------------------------------------------------------------------------
// Authentication: app JWT (RS256) and installation tokens
// ---------------------------------------------------------------------------------------------------------------------

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const encoder = new TextEncoder()

function derLength(length: number) {
  if (length < 0x80) return [length]
  const bytes: number[] = []
  for (let n = length; n > 0; n >>= 8) bytes.unshift(n & 0xff)
  return [0x80 | bytes.length, ...bytes]
}
function der(tag: number, content: Uint8Array) {
  return new Uint8Array([tag, ...derLength(content.length), ...content])
}

/** PEM to PKCS#8 DER. GitHub hands out PKCS#1 ("BEGIN RSA PRIVATE KEY"), which WebCrypto can't import: wrap it. */
export function pemToPkcs8(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----(BEGIN|END)[^-]+-----/g, '').replace(/\s+/g, '')
  const bytes = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
  if (!/BEGIN RSA PRIVATE KEY/.test(pem)) return bytes
  const rsaAlgorithm = new Uint8Array([0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00])
  const version = new Uint8Array([0x02, 0x01, 0x00])
  const inner = new Uint8Array([...version, ...rsaAlgorithm, ...der(0x04, bytes)])
  return der(0x30, inner) as Uint8Array<ArrayBuffer>
}

const signingKeys = new Map<string, Promise<CryptoKey>>()
function signingKey(pem: string) {
  let key = signingKeys.get(pem)
  if (!key) {
    key = crypto.subtle.importKey('pkcs8', pemToPkcs8(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign'])
    key.catch(() => signingKeys.delete(pem))
    signingKeys.set(pem, key)
  }
  return key
}

/** A JWT identifying the app itself (10 minutes; issued a minute in the past for clock drift). */
export async function appJwt(config: Pick<GithubConfig, 'appId' | 'privateKey'>) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))
  const claims = b64url(encoder.encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: config.appId })))
  let key: CryptoKey
  try {
    key = await signingKey(config.privateKey)
  } catch {
    throw createError({ status: 409, message: 'The GitHub App’s private key is not a valid PEM key' })
  }
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claims}`)))
  return `${header}.${claims}.${b64url(signature)}`
}

const tokens = new Map<string, { token: string; expiresAt: number }>()

async function installationToken(config: GithubConfig, installationId: number) {
  const cacheKey = `${config.appId}:${installationId}`
  const cached = tokens.get(cacheKey)
  if (cached && cached.expiresAt - Date.now() > 5 * 60_000) return cached.token
  const result = await githubFetch<{ token: string; expires_at: string }>(config, `/app/installations/${installationId}/access_tokens`, {
    method: 'POST',
    auth: `Bearer ${await appJwt(config)}`,
  })
  tokens.set(cacheKey, { token: result.token, expiresAt: Date.parse(result.expires_at) })
  return result.token
}

// ---------------------------------------------------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------------------------------------------------

export class GithubError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
  }
}

async function githubFetch<T>(config: Pick<GithubConfig, 'apiUrl'>, path: string, options: { method?: string; body?: unknown; auth: string }): Promise<T> {
  const response = await fetch(`${config.apiUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      accept: 'application/vnd.github+json',
      authorization: options.auth,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'Ticketer',
      ...(options.body !== undefined && { 'content-type': 'application/json' }),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    signal: AbortSignal.timeout(15_000),
  })
  if (response.status === 204) return undefined as T
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message = (body as { message?: string } | null)?.message ?? response.statusText
    throw new GithubError(`GitHub ${options.method ?? 'GET'} ${path.split('?')[0]}: ${response.status} ${message}`, response.status, body)
  }
  return body as T
}

/** Calls the GitHub API as the app (JWT): app and installation metadata. */
export async function asApp<T>(config: GithubConfig, path: string, options: { method?: string; body?: unknown } = {}) {
  return githubFetch<T>(config, path, { ...options, auth: `Bearer ${await appJwt(config)}` })
}

/** Calls the GitHub API as an installation: everything about its repositories. */
export async function asInstallation<T>(config: GithubConfig, installationId: number, path: string, options: { method?: string; body?: unknown } = {}) {
  try {
    return await githubFetch<T>(config, path, { ...options, auth: `token ${await installationToken(config, installationId)}` })
  } catch (error) {
    // A revoked or expired token: drop it so the next call gets a fresh one.
    if (error instanceof GithubError && error.status === 401) tokens.delete(`${config.appId}:${installationId}`)
    throw error
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Webhooks
// ---------------------------------------------------------------------------------------------------------------------

/** Checks `X-Hub-Signature-256` (HMAC-SHA256 of the raw body) in constant time. */
export async function verifyWebhookSignature(secret: string, body: string, header: string | undefined) {
  const expected = /^sha256=([0-9a-f]{64})$/.exec(header ?? '')?.[1]
  if (!expected) return false
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)))
  const actual = Array.from(mac, (b) => b.toString(16).padStart(2, '0')).join('')
  let diff = 0
  for (let i = 0; i < 64; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Signed `state` for the browser round trips to GitHub (app creation, installation)
// ---------------------------------------------------------------------------------------------------------------------

async function stateKey() {
  const hex = await deriveSecret('ticketer:github-state')
  return crypto.subtle.importKey('raw', encoder.encode(hex), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

/** `payload.expiry.signature`, valid for an hour. The payload is plain text such as "manifest:<userId>". */
export async function signState(payload: string) {
  const body = `${b64url(encoder.encode(payload))}.${Date.now() + 60 * 60_000}`
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await stateKey(), encoder.encode(body)))
  return `${body}.${b64url(mac)}`
}

export async function readState(state: string | undefined): Promise<string | null> {
  const [payload, expiry, signature] = (state ?? '').split('.')
  if (!payload || !expiry || !signature || Number(expiry) < Date.now()) return null
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', await stateKey(), encoder.encode(`${payload}.${expiry}`)))
  if (b64url(mac) !== signature) return null
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(payload.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))
  } catch {
    return null
  }
}

export function logGithubError(message: string, error: unknown) {
  log.warn(message, error instanceof Error ? error.message : String(error))
}
