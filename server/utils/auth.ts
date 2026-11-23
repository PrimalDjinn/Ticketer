import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

export function toPublicUser(user: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: displayName(user),
    email: user.email,
    isAdmin: user.isAdmin,
    isGuest: user.isGuest,
  }
}

export function displayName(user: { id: string; name: string | null; isGuest?: boolean } | null | undefined) {
  if (!user) return 'Deleted user'
  return user.name || `Guest ${user.id.slice(-6).toLowerCase()}`
}

export async function startSession(event: H3Event, user: typeof schema.users.$inferSelect) {
  await replaceUserSession(event, { user: toPublicUser(user), loggedInAt: Date.now() })
}

/** The signed-in user (registered or guest). Throws 401 when there is no session at all. */
export async function requireUser(event: H3Event) {
  const { user } = await requireUserSession(event)
  return user
}

/** A registered (non-guest) user. */
export async function requireMember(event: H3Event) {
  const user = await requireUser(event)
  if (user.isGuest) throw createError({ status: 401, message: 'Please sign in to continue' })
  return user
}

/** Admin flag is re-read from the database so a demotion takes effect immediately. */
export async function requireAdmin(event: H3Event) {
  const user = await requireMember(event)
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, user.id), columns: { isAdmin: true } })
  if (!row?.isAdmin) throw createError({ status: 403, message: 'Admins only' })
  return user
}

/**
 * Returns the current user, creating an anonymous guest (and its session) on first use. Guests can open tickets and
 * chat with support; registering later upgrades the same row.
 */
export async function ensureUser(event: H3Event) {
  const session = await getUserSession(event)
  if (session.user) {
    const exists = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id), columns: { id: true } })
    if (exists) return session.user
  }
  const [guest] = await db.insert(schema.users).values({ id: ulid(), isGuest: true }).returning()
  await startSession(event, guest!)
  return toPublicUser(guest!)
}

export async function isAdminUser(userId: string) {
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { isAdmin: true } })
  return !!row?.isAdmin
}

export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
