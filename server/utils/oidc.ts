import type { H3Event } from 'h3'
import { useSession } from 'h3'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { deriveSecret } from 'nuxt/server'
import { db, schema } from 'hub:db'

/**
 * Generic OpenID Connect sign-in (authorization code + PKCE S256, state and nonce), written against `fetch` and
 * WebCrypto only so it runs on Node and Workers. Nothing provider-specific: Authentik, Keycloak, Entra ID, Google,
 * Zitadel… all publish `/.well-known/openid-configuration`.
 */
const log = useLogger('oidc')

// ---------------------------------------------------------------------------------------------------------------------
// Configuration: env (NUXT_OIDC_*) wins field by field over Settings → Sign-in (the `oidc` setting)
// ---------------------------------------------------------------------------------------------------------------------

export const oidcSettingsShape = z.object({
  enabled: z.boolean().default(false),
  issuer: z.string().default(''),
  clientId: z.string().default(''),
  /** Encrypted with `encryptSecret`. */
  clientSecret: z.string().default(''),
  name: z.string().default(''),
  scopes: z.string().default(''),
  defaultRole: z.enum(OIDC_DEFAULT_ROLES).optional(),
  groupsClaim: z.string().default(''),
  roleGroups: z.string().default(''),
  only: z.boolean().default(false),
})
export type OidcStoredSettings = z.output<typeof oidcSettingsShape>

export const OIDC_DEFAULTS = {
  name: 'Single sign-on',
  scopes: 'openid email profile',
  defaultRole: 'external',
  groupsClaim: 'groups',
} as const

export interface OidcConfig {
  /** Enabled and complete. */
  active: boolean
  enabled: boolean
  issuer: string
  clientId: string
  clientSecret: string
  name: string
  scopes: string
  defaultRole: OidcDefaultRole
  groupsClaim: string
  roleGroups: { role: UserRole; group: string }[]
  roleGroupsText: string
  /** SSO only: no password sign-in (except admins, as a break-glass), sign-up or reset. Only while active. */
  only: boolean
  /** The SSO-only switch as configured, whether or not SSO is active. */
  onlyRequested: boolean
  redirectUrl: string
  sources: Record<'enabled' | 'issuer' | 'clientId' | 'clientSecret' | 'name' | 'scopes' | 'defaultRole' | 'groupsClaim' | 'roleGroups' | 'only', ConfigSource>
  problem: string | null
}

/** Env values arrive as strings, or as booleans when Nitro parsed `true`/`false`. */
function envText(value: unknown) {
  return value === undefined || value === null ? '' : String(value).trim()
}
function envFlag(value: unknown): boolean | null {
  const text = envText(value).toLowerCase()
  if (!text) return null
  return ['1', 'true', 'yes', 'on'].includes(text)
}

export function parseRoleGroups(text: string) {
  const entries: { role: UserRole; group: string }[] = []
  for (const part of text.split(',')) {
    const [rawRole, ...rest] = part.split(':')
    const role = USER_ROLES.find((r) => r === rawRole?.trim().toLowerCase())
    const group = rest.join(':').trim()
    if (!part.trim()) continue
    if (!role || !group) {
      log.warn(`ignoring role mapping "${part.trim()}" (use role:group, role being admin, member, viewer or external)`)
      continue
    }
    entries.push({ role, group })
  }
  return entries
}

export async function readOidcSettings() {
  return (await getSetting('oidc', oidcSettingsShape)) ?? null
}

export async function oidcConfig(event?: H3Event): Promise<OidcConfig> {
  const env = (event ? useRuntimeConfig(event) : useRuntimeConfig()).oidc
  const stored = await readOidcSettings()
  const s = stored ?? oidcSettingsShape.parse({})

  const pick = (envValue: unknown, storedValue: string): [string, ConfigSource] => {
    const fromEnv = envText(envValue)
    if (fromEnv) return [fromEnv, 'env']
    return storedValue.trim() ? [storedValue.trim(), 'settings'] : ['', 'unset']
  }
  const [issuer, issuerSource] = pick(env.issuer, s.issuer)
  const [clientId, clientIdSource] = pick(env.clientId, s.clientId)
  const [name, nameSource] = pick(env.name, s.name)
  const [scopes, scopesSource] = pick(env.scopes, s.scopes)
  const [groupsClaim, groupsClaimSource] = pick(env.groupsClaim, s.groupsClaim)
  const [roleGroupsText, roleGroupsSource] = pick(env.roleGroups, s.roleGroups)

  let clientSecret = envText(env.clientSecret)
  let clientSecretSource: ConfigSource = clientSecret ? 'env' : 'unset'
  if (!clientSecret && s.clientSecret) {
    clientSecret = (await decryptSecret(s.clientSecret)) ?? ''
    clientSecretSource = 'settings'
  }

  const envRole = envText(env.defaultRole).toLowerCase()
  const parsedEnvRole = OIDC_DEFAULT_ROLES.find((r) => r === envRole)
  if (envRole && !parsedEnvRole) log.warn(`NUXT_OIDC_DEFAULT_ROLE="${envRole}" is not one of ${OIDC_DEFAULT_ROLES.join(', ')}; ignoring it`)
  const defaultRole: OidcDefaultRole = parsedEnvRole ?? s.defaultRole ?? OIDC_DEFAULTS.defaultRole
  const defaultRoleSource: ConfigSource = parsedEnvRole ? 'env' : s.defaultRole ? 'settings' : 'unset'

  // Enabled: NUXT_OIDC_ENABLED, else implied by env issuer + client id, else the Settings toggle.
  const envEnabled = envFlag(env.enabled)
  let enabled: boolean
  let enabledSource: ConfigSource
  if (envEnabled !== null) [enabled, enabledSource] = [envEnabled, 'env']
  else if (issuerSource === 'env' && clientIdSource === 'env') [enabled, enabledSource] = [true, 'env']
  else [enabled, enabledSource] = [s.enabled, stored ? 'settings' : 'unset']

  const envOnly = envFlag(env.only)
  const only = envOnly ?? s.only
  const onlySource: ConfigSource = envOnly !== null ? 'env' : stored ? 'settings' : 'unset'

  let problem: string | null = null
  if (enabled && !issuer) problem = 'Set the issuer URL'
  else if (enabled && !clientId) problem = 'Set the client ID'
  else if (enabled && clientSecretSource === 'settings' && !clientSecret) problem = 'The stored client secret cannot be read (was NUXT_APP_SECRET changed?). Enter it again.'
  else if (enabled && issuer && !isAllowedUrl(issuer)) problem = 'The issuer must be an https:// URL'
  const active = enabled && !problem

  return {
    active,
    enabled,
    issuer,
    clientId,
    clientSecret,
    name: name || OIDC_DEFAULTS.name,
    scopes: normaliseScopes(scopes || OIDC_DEFAULTS.scopes),
    defaultRole,
    groupsClaim: groupsClaim || OIDC_DEFAULTS.groupsClaim,
    roleGroups: parseRoleGroups(roleGroupsText),
    roleGroupsText,
    only: active && only,
    onlyRequested: only,
    redirectUrl: envText(env.redirectUrl),
    sources: {
      enabled: enabledSource,
      issuer: issuerSource,
      clientId: clientIdSource,
      clientSecret: clientSecretSource,
      name: nameSource,
      scopes: scopesSource,
      defaultRole: defaultRoleSource,
      groupsClaim: groupsClaimSource,
      roleGroups: roleGroupsSource,
      only: onlySource,
    },
    problem: enabled ? problem : null,
  }
}

function normaliseScopes(scopes: string) {
  const list = scopes.split(/[\s,]+/).filter(Boolean)
  if (!list.includes('openid')) list.unshift('openid')
  return [...new Set(list)].join(' ')
}

/** The public origin of this site (honours X-Forwarded-Proto from a TLS-terminating proxy). */
export function siteOrigin(event: H3Event) {
  return getRequestURL(event, { xForwardedProto: true }).origin
}

export function oidcCallbackUrl(event: H3Event, config: Pick<OidcConfig, 'redirectUrl'>) {
  return config.redirectUrl || `${siteOrigin(event)}/auth/oidc/callback`
}

/** https everywhere; plain http only for localhost (development and tests). */
function isAllowedUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol === 'https:') return true
    return url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Discovery and keys (cached per process / isolate)
// ---------------------------------------------------------------------------------------------------------------------

const discoveryShape = z.object({
  issuer: z.string().min(1),
  authorization_endpoint: z.string().refine(isAllowedUrl, 'authorization_endpoint must be https'),
  token_endpoint: z.string().refine(isAllowedUrl, 'token_endpoint must be https'),
  jwks_uri: z.string().refine(isAllowedUrl, 'jwks_uri must be https'),
  userinfo_endpoint: z.string().refine(isAllowedUrl, 'userinfo_endpoint must be https').optional(),
  code_challenge_methods_supported: z.array(z.string()).optional(),
  id_token_signing_alg_values_supported: z.array(z.string()).optional(),
  token_endpoint_auth_methods_supported: z.array(z.string()).optional(),
})
export type OidcDiscovery = z.output<typeof discoveryShape>

const DISCOVERY_TTL = 60 * 60 * 1000
const discoveryCache = new Map<string, { doc: OidcDiscovery; at: number }>()

export class OidcError extends Error {
  constructor(
    /** Shown on the sign-in page as `?error=oidc_<code>`. */
    public code: 'disabled' | 'state' | 'denied' | 'failed' | 'unverified_email' | 'no_email' | 'no_access' | 'invite_used',
    message: string,
  ) {
    super(message)
  }
}

const trimSlash = (value: string) => value.replace(/\/+$/, '')

async function fetchJson(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, headers: { accept: 'application/json', ...init?.headers }, signal: AbortSignal.timeout(10_000) })
  const text = await response.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { response, body, text }
}

export async function discover(issuer: string, { fresh = false } = {}): Promise<OidcDiscovery> {
  const key = trimSlash(issuer)
  const cached = discoveryCache.get(key)
  if (!fresh && cached && Date.now() - cached.at < DISCOVERY_TTL) return cached.doc

  const url = `${key}/.well-known/openid-configuration`
  let result: Awaited<ReturnType<typeof fetchJson>>
  try {
    result = await fetchJson(url)
  } catch (error) {
    throw new OidcError('failed', `Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (!result.response.ok) throw new OidcError('failed', `${url} answered ${result.response.status}`)
  const parsed = discoveryShape.safeParse(result.body)
  if (!parsed.success) {
    throw new OidcError('failed', `${url} is not an OpenID configuration: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
  }
  if (trimSlash(parsed.data.issuer) !== key) {
    throw new OidcError('failed', `The provider calls itself "${parsed.data.issuer}", which does not match the configured issuer "${issuer}"`)
  }
  discoveryCache.set(key, { doc: parsed.data, at: Date.now() })
  return parsed.data
}

const jwkShape = z.looseObject({
  kty: z.string(),
  kid: z.string().optional(),
  use: z.string().optional(),
  alg: z.string().optional(),
  n: z.string().optional(),
  e: z.string().optional(),
  crv: z.string().optional(),
  x: z.string().optional(),
  y: z.string().optional(),
})
type Jwk = z.output<typeof jwkShape>
const jwksShape = z.object({ keys: z.array(z.unknown()) })

const jwksCache = new Map<string, { keys: Jwk[]; at: number }>()
const JWKS_TTL = 60 * 60 * 1000
const JWKS_MIN_REFRESH = 30 * 1000

async function jwks(uri: string, refresh: boolean) {
  const cached = jwksCache.get(uri)
  if (cached && !refresh && Date.now() - cached.at < JWKS_TTL) return cached.keys
  if (cached && refresh && Date.now() - cached.at < JWKS_MIN_REFRESH) return cached.keys
  const { response, body } = await fetchJson(uri)
  if (!response.ok) throw new OidcError('failed', `The provider's key set (${uri}) answered ${response.status}`)
  const parsed = jwksShape.safeParse(body)
  if (!parsed.success) throw new OidcError('failed', `The provider's key set (${uri}) is not a JWK set`)
  const keys = parsed.data.keys.flatMap((k) => {
    const key = jwkShape.safeParse(k)
    return key.success ? [key.data] : []
  })
  jwksCache.set(uri, { keys, at: Date.now() })
  return keys
}

// ---------------------------------------------------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder()

export function base64url(bytes: Uint8Array) {
  let text = ''
  for (const byte of bytes) text += String.fromCharCode(byte)
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64url(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

function randomUrlToken(bytes = 32) {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)))
}

async function pkceChallenge(verifier: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))))
}

// ---------------------------------------------------------------------------------------------------------------------
// ID token verification
// ---------------------------------------------------------------------------------------------------------------------

type VerifyAlgorithm = { import: AlgorithmIdentifier | RsaHashedImportParams | EcKeyImportParams; verify: AlgorithmIdentifier | RsaPssParams | EcdsaParams }

const ASYMMETRIC: Record<string, VerifyAlgorithm & { kty: string; crv?: string }> = {
  RS256: { kty: 'RSA', import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
  RS384: { kty: 'RSA', import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-384' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
  RS512: { kty: 'RSA', import: { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-512' }, verify: { name: 'RSASSA-PKCS1-v1_5' } },
  PS256: { kty: 'RSA', import: { name: 'RSA-PSS', hash: 'SHA-256' }, verify: { name: 'RSA-PSS', saltLength: 32 } },
  PS384: { kty: 'RSA', import: { name: 'RSA-PSS', hash: 'SHA-384' }, verify: { name: 'RSA-PSS', saltLength: 48 } },
  PS512: { kty: 'RSA', import: { name: 'RSA-PSS', hash: 'SHA-512' }, verify: { name: 'RSA-PSS', saltLength: 64 } },
  ES256: { kty: 'EC', crv: 'P-256', import: { name: 'ECDSA', namedCurve: 'P-256' }, verify: { name: 'ECDSA', hash: 'SHA-256' } },
  ES384: { kty: 'EC', crv: 'P-384', import: { name: 'ECDSA', namedCurve: 'P-384' }, verify: { name: 'ECDSA', hash: 'SHA-384' } },
  EdDSA: { kty: 'OKP', crv: 'Ed25519', import: { name: 'Ed25519' }, verify: { name: 'Ed25519' } },
}
const HMAC_HASH: Record<string, string> = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' }

const headerShape = z.object({ alg: z.string(), kid: z.string().optional(), typ: z.string().optional() })
const claimsShape = z.looseObject({
  iss: z.string(),
  sub: z.string().min(1),
  aud: z.union([z.string(), z.array(z.string())]),
  exp: z.number(),
  iat: z.number().optional(),
  nonce: z.string().optional(),
  azp: z.string().optional(),
})
export type IdTokenClaims = z.output<typeof claimsShape>

/** Only the members a key needs, so `alg`/`key_ops`/`x5c` quirks in a provider's JWKS cannot break the import. */
function publicJwk(jwk: Jwk): JsonWebKey {
  if (jwk.kty === 'RSA') return { kty: 'RSA', n: jwk.n, e: jwk.e }
  if (jwk.kty === 'EC') return { kty: 'EC', crv: jwk.crv, x: jwk.x, y: jwk.y }
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x }
}

export async function verifyIdToken(
  token: string,
  expected: { issuer: string; clientId: string; clientSecret: string; jwksUri: string; nonce: string },
): Promise<IdTokenClaims> {
  const parts = token.split('.')
  if (parts.length !== 3) throw new OidcError('failed', 'The ID token is not a JWT')
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string]
  const decodeJson = (part: string) => JSON.parse(new TextDecoder().decode(fromBase64url(part)))
  let header: z.output<typeof headerShape>
  let claims: IdTokenClaims
  try {
    header = headerShape.parse(decodeJson(headerPart))
    claims = claimsShape.parse(decodeJson(payloadPart))
  } catch {
    throw new OidcError('failed', 'The ID token could not be decoded')
  }

  const data = encoder.encode(`${headerPart}.${payloadPart}`)
  const signature = fromBase64url(signaturePart)
  let valid = false
  if (HMAC_HASH[header.alg]) {
    // Symmetric tokens are signed with the client secret (OIDC Core 10.1); Authentik does this without a signing key.
    if (!expected.clientSecret) throw new OidcError('failed', `The ID token uses ${header.alg} but no client secret is configured`)
    const key = await crypto.subtle.importKey('raw', encoder.encode(expected.clientSecret), { name: 'HMAC', hash: HMAC_HASH[header.alg]! }, false, ['verify'])
    valid = await crypto.subtle.verify('HMAC', key, signature, data)
  } else {
    const algorithm = ASYMMETRIC[header.alg]
    if (!algorithm) throw new OidcError('failed', `Unsupported ID token algorithm ${header.alg}`)
    const pickKey = (keys: Jwk[]) =>
      keys.filter(
        (k) =>
          k.kty === algorithm.kty &&
          (!algorithm.crv || k.crv === algorithm.crv) &&
          (k.use === undefined || k.use === 'sig') &&
          (k.alg === undefined || k.alg === header.alg) &&
          (header.kid === undefined || k.kid === header.kid),
      )
    let candidates = pickKey(await jwks(expected.jwksUri, false))
    if (!candidates.length) candidates = pickKey(await jwks(expected.jwksUri, true)) // keys rotated since we cached them
    if (!candidates.length) throw new OidcError('failed', `No key in the provider's key set matches the ID token (kid ${header.kid ?? 'none'})`)
    for (const jwk of candidates) {
      try {
        const key = await crypto.subtle.importKey('jwk', publicJwk(jwk), algorithm.import, false, ['verify'])
        if (await crypto.subtle.verify(algorithm.verify, key, signature, data)) {
          valid = true
          break
        }
      } catch (error) {
        log.warn('could not use a key from the provider key set', error)
      }
    }
  }
  if (!valid) throw new OidcError('failed', 'The ID token signature is not valid')

  const now = Math.floor(Date.now() / 1000)
  const skew = 60
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (claims.iss !== expected.issuer) throw new OidcError('failed', `The ID token was issued by ${claims.iss}, expected ${expected.issuer}`)
  if (!audiences.includes(expected.clientId)) throw new OidcError('failed', 'The ID token is meant for another client')
  if ((audiences.length > 1 || claims.azp !== undefined) && claims.azp !== expected.clientId) {
    throw new OidcError('failed', 'The ID token was issued to another client (azp)')
  }
  if (claims.exp < now - skew) throw new OidcError('failed', 'The ID token has expired')
  if (claims.iat !== undefined && claims.iat > now + skew) throw new OidcError('failed', 'The ID token was issued in the future (check the server clocks)')
  if (claims.nonce !== expected.nonce) throw new OidcError('failed', 'The ID token nonce does not match this sign-in')
  return claims
}

// ---------------------------------------------------------------------------------------------------------------------
// The flow
// ---------------------------------------------------------------------------------------------------------------------

const stateShape = z.object({
  state: z.string(),
  nonce: z.string(),
  verifier: z.string(),
  redirect: z.string(),
  issuer: z.string(),
  createdAt: z.number(),
})
type LoginState = z.output<typeof stateShape>
const STATE_MAX_AGE = 10 * 60

/** The short-lived, sealed cookie that carries state, nonce, PKCE verifier and where to go afterwards. */
async function loginStateSession(event: H3Event) {
  return useSession<Partial<LoginState>>(event, {
    name: 'ticketer-oidc',
    password: await deriveSecret('ticketer:oidc-login-state'),
    maxAge: STATE_MAX_AGE,
    cookie: { httpOnly: true, sameSite: 'lax', path: '/auth/oidc', secure: getRequestURL(event, { xForwardedProto: true }).protocol === 'https:' },
  })
}

/** A same-site path to return to after signing in; anything else falls back to the home page. */
export function safeRedirect(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/'
  if (/[\u0000-\u001f]/.test(value)) return '/'
  if (value.startsWith('/auth/oidc')) return '/'
  return value.slice(0, 2000)
}

/** The sign-in page with an error code it explains (`?error=oidc_state` …), keeping where the person was headed. */
export function loginErrorUrl(code: OidcError['code'], redirect?: string) {
  const target = safeRedirect(redirect)
  const params = new URLSearchParams({ error: `oidc_${code}` })
  if (target !== '/') params.set('redirect', target)
  return `/auth/login?${params}`
}

/** Builds the provider's authorization URL and remembers the sign-in attempt in the sealed cookie. */
export async function beginOidcLogin(event: H3Event, redirect: string) {
  const config = await oidcConfig(event)
  if (!config.active) throw new OidcError('disabled', 'Single sign-on is not set up')
  const doc = await discover(config.issuer)
  if (doc.code_challenge_methods_supported && !doc.code_challenge_methods_supported.includes('S256')) {
    log.warn('the provider does not advertise PKCE S256; sending it anyway')
  }
  const attempt: LoginState = {
    state: randomUrlToken(),
    nonce: randomUrlToken(),
    verifier: randomUrlToken(48),
    redirect,
    issuer: config.issuer,
    createdAt: Date.now(),
  }
  const session = await loginStateSession(event)
  await session.update(attempt)

  const url = new URL(doc.authorization_endpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', oidcCallbackUrl(event, config))
  url.searchParams.set('scope', config.scopes)
  url.searchParams.set('state', attempt.state)
  url.searchParams.set('nonce', attempt.nonce)
  url.searchParams.set('code_challenge', await pkceChallenge(attempt.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.toString()
}

const tokenShape = z.object({ id_token: z.string(), access_token: z.string().optional(), token_type: z.string().optional() })

export interface OidcProfile {
  claims: IdTokenClaims
  sub: string
  email: string | null
  emailVerified: boolean
  name: string | null
  username: string | null
  groups: string[]
}

/** Finishes the provider round trip: checks state, swaps the code (with the PKCE verifier) and verifies the ID token. */
export async function completeOidcLogin(
  event: H3Event,
  query: { code?: string; state?: string; error?: string; error_description?: string; iss?: string },
): Promise<{ profile: OidcProfile; redirect: string; config: OidcConfig }> {
  const session = await loginStateSession(event)
  const saved = stateShape.safeParse(session.data)
  await session.clear()
  deleteCookie(event, 'ticketer-oidc', { path: '/auth/oidc' })

  const config = await oidcConfig(event)
  if (!config.active) throw new OidcError('disabled', 'Single sign-on is not set up')
  if (!saved.success) throw new OidcError('state', 'The sign-in attempt expired or was started in another browser')
  const attempt = saved.data
  if (query.error) throw new OidcError('denied', `The provider refused: ${query.error}${query.error_description ? ` (${query.error_description})` : ''}`)
  if (!query.state || !timingSafeEqualText(query.state, attempt.state)) throw new OidcError('state', 'The sign-in state does not match')
  if (Date.now() - attempt.createdAt > STATE_MAX_AGE * 1000) throw new OidcError('state', 'The sign-in attempt expired')
  if (attempt.issuer !== config.issuer) throw new OidcError('state', 'The provider changed during sign-in')
  if (!query.code) throw new OidcError('failed', 'The provider sent no authorization code')

  const doc = await discover(config.issuer)
  if (query.iss && query.iss !== doc.issuer) throw new OidcError('failed', 'The authorization response came from another issuer')

  // Token request: client_secret_basic unless the provider only supports client_secret_post; public clients send the id.
  const body = new URLSearchParams({ grant_type: 'authorization_code', code: query.code, redirect_uri: oidcCallbackUrl(event, config), code_verifier: attempt.verifier })
  const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded' }
  const methods = doc.token_endpoint_auth_methods_supported ?? ['client_secret_basic']
  if (config.clientSecret && methods.includes('client_secret_basic')) {
    headers.authorization = `Basic ${btoa(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`)}`
  } else {
    body.set('client_id', config.clientId)
    if (config.clientSecret) body.set('client_secret', config.clientSecret)
  }
  let tokenResult: Awaited<ReturnType<typeof fetchJson>>
  try {
    tokenResult = await fetchJson(doc.token_endpoint, { method: 'POST', headers, body })
  } catch (error) {
    throw new OidcError('failed', `Could not reach the token endpoint: ${error instanceof Error ? error.message : String(error)}`)
  }
  const tokens = tokenShape.safeParse(tokenResult.body)
  if (!tokenResult.response.ok || !tokens.success) {
    const detail = z.object({ error: z.string(), error_description: z.string().optional() }).safeParse(tokenResult.body)
    throw new OidcError(
      'failed',
      `The token endpoint answered ${tokenResult.response.status}${detail.success ? `: ${detail.data.error}${detail.data.error_description ? ` (${detail.data.error_description})` : ''}` : ''}`,
    )
  }

  const claims = await verifyIdToken(tokens.data.id_token, {
    issuer: doc.issuer,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    jwksUri: doc.jwks_uri,
    nonce: attempt.nonce,
  })

  // Some providers keep email, name or groups out of the ID token; the userinfo endpoint has them.
  let merged: Record<string, unknown> = { ...claims }
  const needsMore = !merged.email || claimAt(merged, config.groupsClaim) === undefined
  if (needsMore && doc.userinfo_endpoint && tokens.data.access_token) {
    try {
      const info = await fetchJson(doc.userinfo_endpoint, { headers: { authorization: `Bearer ${tokens.data.access_token}` } })
      const parsed = z.looseObject({ sub: z.string() }).safeParse(info.body)
      if (info.response.ok && parsed.success && parsed.data.sub === claims.sub) merged = { ...pickDefined(parsed.data), ...pickDefined(claims) }
      else if (info.response.ok) log.warn('ignoring userinfo: its subject does not match the ID token')
    } catch (error) {
      log.warn('userinfo request failed', error)
    }
  }

  const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const email = text(merged.email)?.toLowerCase() ?? null
  const groupsValue = claimAt(merged, config.groupsClaim)
  const groups = Array.isArray(groupsValue) ? groupsValue.filter((g): g is string => typeof g === 'string') : typeof groupsValue === 'string' ? [groupsValue] : []
  return {
    profile: {
      claims,
      sub: claims.sub,
      email: email && z.email().safeParse(email).success ? email : null,
      emailVerified: merged.email_verified === true || merged.email_verified === 'true',
      name: text(merged.name),
      username: text(merged.preferred_username) ?? text(merged.nickname),
      groups,
    },
    redirect: attempt.redirect,
    config,
  }
}

/** ID token claims win over userinfo, except where the ID token left a claim out. */
function pickDefined(info: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== null))
}

/** `groups`, or a dotted path such as `realm_access.roles` (Keycloak). */
function claimAt(claims: Record<string, unknown>, path: string): unknown {
  if (path in claims) return claims[path]
  let node: unknown = claims
  for (const part of path.split('.')) {
    if (!node || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

const ROLE_RANK: Record<UserRole, number> = { admin: 4, member: 3, viewer: 2, external: 1 }

/** The most powerful role any of the person's groups maps to, or null when no mapping matches. */
export function roleFromGroups(config: Pick<OidcConfig, 'roleGroups'>, groups: string[]) {
  let best: UserRole | null = null
  for (const { role, group } of config.roleGroups) {
    if (groups.includes(group) && (!best || ROLE_RANK[role] > ROLE_RANK[best])) best = role
  }
  return best
}

export function timingSafeEqualText(a: string, b: string) {
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  let diff = left.length ^ right.length
  for (let i = 0; i < Math.max(left.length, right.length); i++) diff |= (left[i] ?? 0) ^ (right[i] ?? 0)
  return diff === 0
}

// ---------------------------------------------------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Finds, links or creates the account for a verified sign-in:
 *  1. an account already linked to this provider subject;
 *  2. else an account with the same email, linked only when the provider says the email is verified;
 *  3. else a new account (upgrading the browser's guest row when there is one). The role comes from the mapped groups,
 *     else a pending invitation for the email (consumed), else admin for the very first account, else the default role.
 * When group mapping is configured and matches, it re-decides the role at every sign-in (never demoting the last admin).
 */
export async function signInWithOidc(event: H3Event, profile: OidcProfile, config: OidcConfig) {
  const provider = `oidc:${trimSlash(config.issuer)}`
  const mapped = config.roleGroups.length ? roleFromGroups(config, profile.groups) : null

  let user: typeof schema.users.$inferSelect | null = null
  const linked = await findIdentityUser(provider, profile.sub)
  if (linked) {
    user = linked.user
    await touchIdentity(linked.identityId, profile.email)
  } else if (profile.email) {
    const existing = await db.query.users.findFirst({ where: eq(schema.users.email, profile.email) })
    if (existing) {
      if (!profile.emailVerified) {
        throw new OidcError('unverified_email', `An account with ${profile.email} already exists, but the provider has not verified that address`)
      }
      await linkIdentity(provider, profile.sub, existing.id, profile.email)
      log.info('linked an existing account by verified email', { userId: existing.id })
      user = existing
    }
  }

  if (!user) {
    if (!profile.email) throw new OidcError('no_email', 'The provider did not share an email address (add the "email" scope)')
    // Invitations are for an address: only a verified one may claim them.
    const invite = profile.emailVerified ? await findPendingInviteByEmail(profile.email) : null
    let role: UserRole | null = mapped ?? invite?.role ?? null
    if (!role && (await isFirstAccount())) role = 'admin'
    if (!role && config.defaultRole !== 'none') role = config.defaultRole
    if (!role) throw new OidcError('no_access', 'Your account has no access here. Ask an admin for an invitation.')

    const useInvite = invite
    if (useInvite && !(await claimInvite(useInvite.id))) throw new OidcError('invite_used', 'Your invitation was just used by another sign-in')

    const guestId = await sessionGuestId(event)
    const values = {
      email: profile.email,
      name: await uniqueUsername(profile.username, profile.email.split('@')[0], profile.name),
      isGuest: false,
      role,
    }
    const [created] = guestId
      ? await db.update(schema.users).set(values).where(eq(schema.users.id, guestId)).returning()
      : await db.insert(schema.users).values({ id: ulid(), ...values }).returning()
    user = created!
    if (useInvite) await markInviteAccepted(useInvite.id, user.id)
    await linkIdentity(provider, profile.sub, user.id, profile.email)
    log.info('created an account from single sign-on', { userId: user.id, role, invite: !!useInvite, upgradedGuest: !!guestId })
    return user
  }

  if (mapped && mapped !== user.role && !user.isGuest) {
    if (ROLE_RANK[mapped] < ROLE_RANK[user.role] && (await isLastAdmin(user))) {
      log.warn('not demoting the last admin from single sign-on groups', { userId: user.id, mapped })
    } else {
      const [updated] = await db.update(schema.users).set({ role: mapped }).where(eq(schema.users.id, user.id)).returning()
      log.info('role changed by single sign-on groups', { userId: user.id, from: user.role, to: mapped })
      user = updated!
    }
  }
  return user
}

// ---------------------------------------------------------------------------------------------------------------------
// Settings → Sign-in
// ---------------------------------------------------------------------------------------------------------------------

export const ENV_NAMES: Record<keyof OidcConfig['sources'], string> = {
  enabled: 'NUXT_OIDC_ENABLED',
  issuer: 'NUXT_OIDC_ISSUER',
  clientId: 'NUXT_OIDC_CLIENT_ID',
  clientSecret: 'NUXT_OIDC_CLIENT_SECRET',
  name: 'NUXT_OIDC_NAME',
  scopes: 'NUXT_OIDC_SCOPES',
  defaultRole: 'NUXT_OIDC_DEFAULT_ROLE',
  groupsClaim: 'NUXT_OIDC_GROUPS_CLAIM',
  roleGroups: 'NUXT_OIDC_ROLE_GROUPS',
  only: 'NUXT_OIDC_ONLY',
}

export async function oidcSettingsDTO(event: H3Event): Promise<OidcSettingsDTO> {
  const config = await oidcConfig(event)
  const stored = await readOidcSettings()
  const field = <T>(key: keyof OidcConfig['sources'], value: T) => ({ value, source: config.sources[key] })
  return {
    enabled: field('enabled', config.enabled),
    issuer: field('issuer', config.issuer),
    clientId: field('clientId', config.clientId),
    clientSecret: { set: !!config.clientSecret || !!stored?.clientSecret, source: config.sources.clientSecret },
    // Shown as typed (empty = default) so the form does not save defaults as if chosen.
    name: field('name', config.sources.name === 'unset' ? '' : config.name),
    scopes: field('scopes', config.sources.scopes === 'unset' ? '' : config.scopes),
    defaultRole: field('defaultRole', config.defaultRole),
    groupsClaim: field('groupsClaim', config.sources.groupsClaim === 'unset' ? '' : config.groupsClaim),
    roleGroups: field('roleGroups', config.roleGroupsText),
    only: field('only', config.onlyRequested),
    callbackUrl: oidcCallbackUrl(event, config),
    active: config.active,
    problem: config.problem,
  }
}

/** Fetches the discovery document (bypassing the cache) and the key set, and describes what was found. */
export async function testOidcIssuer(issuer: string): Promise<OidcTestResult> {
  if (!issuer) return { ok: false, message: 'Enter the issuer URL first' }
  if (!isAllowedUrl(issuer)) return { ok: false, message: 'The issuer must be an https:// URL' }
  try {
    const doc = await discover(issuer, { fresh: true })
    const keys = await jwks(doc.jwks_uri, true)
    const pkce = !doc.code_challenge_methods_supported || doc.code_challenge_methods_supported.includes('S256')
    const algs = doc.id_token_signing_alg_values_supported ?? []
    const unsupported = algs.length > 0 && !algs.some((a) => a in ASYMMETRIC || a in HMAC_HASH)
    return {
      ok: !unsupported,
      message: unsupported
        ? `Connected, but the provider signs ID tokens with ${algs.join(', ')}, which Ticketer does not support`
        : `Connected to ${doc.issuer}: ${keys.length} signing key${keys.length === 1 ? '' : 's'}${pkce ? ', PKCE supported' : ', PKCE not advertised'}`,
      issuer: doc.issuer,
      endpoints: { authorization: doc.authorization_endpoint, token: doc.token_endpoint, userinfo: doc.userinfo_endpoint ?? null, jwks: doc.jwks_uri },
      pkce,
      signingAlgs: algs,
    }
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}

export function isAllowedIssuer(value: string) {
  return isAllowedUrl(value)
}
