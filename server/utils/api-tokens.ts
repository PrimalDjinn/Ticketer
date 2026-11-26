import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/**
 * Personal access tokens (`tkp_…`) for `/api/v1`. A token acts as the person who made it, limited to its scopes; the
 * role is re-read on every call, so a demotion applies at once. Only a SHA-256 hash is stored.
 */
const log = useLogger('api')

type TokenRow = typeof schema.apiTokens.$inferSelect

export const apiTokenSettingsShape = z.object({
  /** Off: no new tokens, and existing ones stop working until it's on again. */
  enabled: z.boolean().default(true),
})
export async function apiTokensEnabled() {
  return (await getSetting('apiTokens', apiTokenSettingsShape))?.enabled ?? true
}

export async function newPersonalToken(userId: string, input: { name: string; scopes: string[]; expiresAt: Date | null }) {
  const token = `tkp_${randomToken(20)}`
  const [row] = await db
    .insert(schema.apiTokens)
    .values({ id: ulid(), userId, name: input.name, keyHash: await sha256(token), keyPrefix: token.slice(0, 12), scopes: input.scopes, expiresAt: input.expiresAt })
    .returning()
  return { token, row: row! }
}

export function toApiTokenDTO(row: TokenRow) {
  return { id: row.id, name: row.name, prefix: row.keyPrefix, scopes: row.scopes, expiresAt: row.expiresAt, lastUsedAt: row.lastUsedAt, createdAt: row.createdAt }
}

// Requests per token in the current minute. Per process (Node) or isolate (Workers): a guard, not an exact quota.
const windows = new Map<string, { start: number; count: number }>()

function rateLimit(event: H3Event, tokenId: string) {
  const limit = Number(useRuntimeConfig().api?.rateLimit) || 600
  const now = Date.now()
  const window = windows.get(tokenId)
  const current = window && now - window.start < 60_000 ? window : { start: now, count: 0 }
  current.count++
  windows.set(tokenId, current)
  if (windows.size > 10_000) windows.clear()
  const reset = Math.ceil((current.start + 60_000 - now) / 1000)
  setHeader(event, 'RateLimit-Limit', limit)
  setHeader(event, 'RateLimit-Remaining', Math.max(0, limit - current.count))
  setHeader(event, 'RateLimit-Reset', reset)
  if (current.count > limit) {
    setHeader(event, 'Retry-After', reset)
    throw apiError(429, 'rate_limited', `More than ${limit} requests this minute. Try again in ${reset} seconds.`)
  }
}

/** An API error with a stable `code` next to the message. */
export function apiError(status: number, code: string, message: string) {
  return createError({ status, message, data: { code } })
}

/**
 * Checks `Authorization: Bearer tkp_…` and makes the request act as the token's owner: `requireUser` and friends
 * return them, with their current role. Returns the token's scopes. Session cookies are never used here.
 */
export async function authenticateToken(event: H3Event) {
  const header = getRequestHeader(event, 'authorization') ?? ''
  const raw = header.match(/^Bearer\s+(tkp_[0-9a-f]{40})$/i)?.[1]
  if (!raw) throw apiError(401, 'unauthenticated', 'Send a personal access token as "Authorization: Bearer tkp_…". Create one under Account → Access tokens.')
  const hash = await sha256(raw)
  const token = await db.query.apiTokens.findFirst({ where: eq(schema.apiTokens.keyHash, hash) })
  if (!token || !safeEqual(token.keyHash, hash)) throw apiError(401, 'invalid_token', 'Unknown or revoked token')
  if (token.expiresAt && token.expiresAt.getTime() < Date.now()) throw apiError(401, 'token_expired', 'This token has expired. Create a new one under Account → Access tokens.')
  if (!(await apiTokensEnabled())) throw apiError(403, 'tokens_disabled', 'An admin has turned off access tokens on this Ticketer')
  const owner = await db.query.users.findFirst({ where: eq(schema.users.id, token.userId) })
  if (!owner || owner.isGuest) throw apiError(401, 'invalid_token', 'The account behind this token no longer exists')
  rateLimit(event, token.id)

  const user = toPublicUser(owner)
  event.context.apiUser = user
  event.context.apiScopes = new Set(token.scopes)
  event.context.apiTokenId = token.id
  setEventActor(event, { type: 'user', id: user.id, name: user.name })
  if (!token.lastUsedAt || Date.now() - token.lastUsedAt.getTime() > 60_000) {
    event.waitUntil(db.update(schema.apiTokens).set({ lastUsedAt: new Date() }).where(eq(schema.apiTokens.id, token.id)).then(() => {}))
  }
  log.info('API call', { token: token.keyPrefix, user: user.id, method: event.method, path: event.path.split('?')[0] })
  return { user, scopes: token.scopes as ApiScope[], tokenId: token.id }
}

/** For token calls: 403 unless the token has `scope`. Browser sessions aren't limited by scopes. */
export function requireApiScope(event: H3Event, scope: ApiScope) {
  const scopes = event.context.apiScopes as Set<string> | undefined
  if (scopes && !scopes.has(scope)) throw apiError(403, 'insufficient_scope', `This token needs the "${scope}" scope`)
}

/** Whether this call may see `scope` data: always for sessions, for tokens only with the scope. */
export function hasApiScope(event: H3Event, scope: ApiScope) {
  const scopes = event.context.apiScopes as Set<string> | undefined
  return !scopes || scopes.has(scope)
}
