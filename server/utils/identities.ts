import { and, count, desc, eq, gt, isNull, ne } from 'drizzle-orm'
import { db, schema } from 'hub:db'

type UserRow = typeof schema.users.$inferSelect

/** The account linked to an outside identity (`oidc`, `app:<id>`), if any. */
export async function findIdentityUser(provider: string, subject: string) {
  const row = await db
    .select({ user: schema.users, identityId: schema.userIdentities.id })
    .from(schema.userIdentities)
    .innerJoin(schema.users, eq(schema.userIdentities.userId, schema.users.id))
    .where(and(eq(schema.userIdentities.provider, provider), eq(schema.userIdentities.subject, subject)))
    .get()
  return row ?? null
}

/** Links an outside identity to an account (no-op when that identity is already linked). */
export async function linkIdentity(provider: string, subject: string, userId: string, email: string | null) {
  await db
    .insert(schema.userIdentities)
    .values({ provider, subject, userId, email, lastUsedAt: new Date() })
    .onConflictDoNothing()
}

export async function touchIdentity(identityId: number, email?: string | null) {
  await db
    .update(schema.userIdentities)
    .set({ lastUsedAt: new Date(), ...(email !== undefined && { email }) })
    .where(eq(schema.userIdentities.id, identityId))
}

/** The newest pending, unexpired invitation for this address. */
export async function findPendingInviteByEmail(email: string) {
  return (
    (await db.query.invites.findFirst({
      where: and(eq(schema.invites.email, email.toLowerCase()), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())),
      orderBy: desc(schema.invites.createdAt),
    })) ?? null
  )
}

/**
 * A free username (3-30 letters, digits, underscores) built from the hints in order, e.g. the provider's
 * preferred_username, then the email's local part. Digits are appended until it is unique.
 */
export async function uniqueUsername(...hints: (string | null | undefined)[]) {
  const clean = (v: string | null | undefined) => (v ?? '').normalize('NFKD').replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24)
  let base = hints.map(clean).find((v) => v.length >= 3) ?? ''
  if (!base) base = `${hints.map(clean).find(Boolean) ?? ''}user`.slice(0, 24)
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate = attempt === 0 ? base : `${base}${attempt < 10 ? attempt + 1 : Math.floor(1000 + Math.random() * 900_000)}`
    const taken = await db.query.users.findFirst({ where: eq(schema.users.name, candidate), columns: { id: true } })
    if (!taken) return candidate
  }
  return `${base.slice(0, 16)}${randomToken(4)}`
}

/** True when `user` is the only admin left, so nothing automatic may demote them. */
export async function isLastAdmin(user: Pick<UserRow, 'id' | 'role' | 'isGuest'>) {
  if (user.role !== 'admin' || user.isGuest) return false
  const [others] = await db
    .select({ value: count() })
    .from(schema.users)
    .where(and(eq(schema.users.role, 'admin'), eq(schema.users.isGuest, false), ne(schema.users.id, user.id)))
  return (others?.value ?? 0) === 0
}

/** The session's guest row, when the browser has one: signing in for the first time upgrades it (keeps its tickets). */
export async function sessionGuestId(event: Parameters<typeof getUserSession>[0]) {
  const session = await getUserSession(event)
  if (!session.user?.isGuest) return null
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id), columns: { id: true, isGuest: true } })
  return row?.isGuest ? row.id : null
}
