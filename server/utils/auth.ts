import type { H3Event } from 'h3'
import { eq } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

export function toPublicUser(user: typeof schema.users.$inferSelect): PublicUser {
  return {
    id: user.id,
    name: displayName(user),
    email: user.email,
    role: user.role,
    isAdmin: user.role === 'admin' && !user.isGuest,
    isGuest: user.isGuest,
    isInternal: isInternal(user),
  }
}

export function displayName(user: { id: string; name: string | null; isGuest?: boolean } | null | undefined) {
  if (!user) return 'Deleted user'
  return user.name || `Guest ${user.id.slice(-6).toLowerCase()}`
}

export async function startSession(event: H3Event, user: typeof schema.users.$inferSelect) {
  await replaceUserSession(event, { user: toPublicUser(user), loggedInAt: Date.now() })
}

/**
 * The signed-in user (registered or guest). Throws 401 when there is no session, or when the account behind it was
 * deleted (its session cookie may still exist on another device).
 */
export async function requireUser(event: H3Event) {
  const { user } = await requireUserSession(event)
  const exists = await db.query.users.findFirst({ where: eq(schema.users.id, user.id), columns: { id: true } })
  if (!exists) {
    await clearUserSession(event)
    throw createError({ status: 401, message: 'This account no longer exists' })
  }
  return user
}

/** A registered (non-guest) user, internal or external. */
export async function requireMember(event: H3Event) {
  const user = await requireUser(event)
  if (user.isGuest) throw createError({ status: 401, message: 'Please sign in to continue' })
  return user
}

/** The role is re-read from the database so promotions and demotions take effect immediately. */
export async function currentRole(userId: string) {
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, userId), columns: { role: true, isGuest: true } })
  return row && !row.isGuest ? row.role : null
}

export async function requireAdmin(event: H3Event) {
  const user = await requireMember(event)
  if ((await currentRole(user.id)) !== 'admin') throw createError({ status: 403, message: 'Admins only' })
  return user
}

/**
 * Someone on the team (admin, member or viewer): projects, tasks, all tickets and the support inbox. People outside
 * the team get a 404 so internal resources cannot be probed.
 */
export async function requireInternal(event: H3Event) {
  const user = await requireMember(event)
  const role = await currentRole(user.id)
  if (!role || !isInternal({ role })) throw createError({ status: 404, message: 'Not found' })
  return { ...user, role, isInternal: true }
}

/** Anyone who may change tasks, projects, tickets and support conversations: admins and members, not viewers. */
export async function requireEditor(event: H3Event) {
  const user = await requireInternal(event)
  if (!isStaff(user)) throw createError({ status: 403, message: 'Viewers cannot make changes' })
  return user
}

/** Same people as `requireEditor`; reads better in support (ticket and conversation) handlers. */
export const requireStaff = requireEditor

/** The current role from the database (not the session copy) applied to a session user. */
export async function withFreshRole<T extends { id: string; role: UserRole; isGuest: boolean }>(user: T) {
  const role = (await currentRole(user.id)) ?? user.role
  return { ...user, role, isAdmin: role === 'admin' && !user.isGuest, isInternal: isInternal({ role, isGuest: user.isGuest }) }
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
  const [guest] = await db.insert(schema.users).values({ id: ulid(), isGuest: true, role: 'external' }).returning()
  await startSession(event, guest!)
  return toPublicUser(guest!)
}


export function randomToken(bytes = 32) {
  const data = crypto.getRandomValues(new Uint8Array(bytes))
  return Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function sha256(input: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}
