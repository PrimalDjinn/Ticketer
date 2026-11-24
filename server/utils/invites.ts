import type { H3Event } from 'h3'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

const log = useLogger('invites')

/** Who may sign up without an invitation. Invitation-only unless an admin opens it up. */
export async function getSignupMode(): Promise<SignupMode> {
  const row = await db.query.settings.findFirst({ where: eq(schema.settings.key, 'signup') })
  return SIGNUP_MODES.find((mode) => mode === row?.value) ?? 'invite'
}

export async function setSignupMode(mode: SignupMode) {
  await db
    .insert(schema.settings)
    .values({ key: 'signup', value: mode })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: mode } })
}

/** True while no registered account exists; the first one to sign up becomes the admin. */
export async function isFirstAccount() {
  const member = await db.query.users.findFirst({ where: eq(schema.users.isGuest, false), columns: { id: true } })
  return !member
}

export function inviteDTO(invite: typeof schema.invites.$inferSelect, invitedBy: string | null): InviteDTO {
  return {
    id: invite.id,
    email: invite.email,
    role: invite.role,
    invitedBy,
    createdAt: invite.createdAt,
    expiresAt: invite.expiresAt,
    expired: invite.expiresAt.getTime() <= Date.now(),
  }
}

type FoundInvite = { ok: true; invite: typeof schema.invites.$inferSelect; invitedBy: string | null } | { ok: false; error: string }

/** A pending, unexpired invitation for this token, or a reason it cannot be used. */
export async function findInvite(token: string): Promise<FoundInvite> {
  const invite = await db.query.invites.findFirst({ where: eq(schema.invites.tokenHash, await sha256(token)) })
  if (!invite) return { ok: false, error: 'This invitation link is not valid. Ask for a new one.' }
  if (invite.acceptedAt) return { ok: false, error: 'This invitation has already been used. Sign in instead.' }
  if (invite.expiresAt.getTime() <= Date.now()) return { ok: false, error: 'This invitation has expired. Ask for a new one.' }
  const inviter = invite.invitedById
    ? await db.query.users.findFirst({ where: eq(schema.users.id, invite.invitedById), columns: { id: true, name: true, isGuest: true } })
    : undefined
  return { ok: true, invite, invitedBy: inviter ? displayName(inviter) : null }
}

/** Marks the invitation used. Returns false when another request got there first. */
export async function claimInvite(id: number) {
  const claimed = await db
    .update(schema.invites)
    .set({ acceptedAt: new Date() })
    .where(and(eq(schema.invites.id, id), isNull(schema.invites.acceptedAt), gt(schema.invites.expiresAt, new Date())))
    .returning({ id: schema.invites.id })
  return claimed.length > 0
}

export async function markInviteAccepted(id: number, userId: string) {
  await db.update(schema.invites).set({ acceptedById: userId }).where(eq(schema.invites.id, id))
}

/**
 * Gives an invitation a fresh token and expiry (new or renewed), then emails the link. The link is returned so the
 * admin can share it by hand when mail is not configured.
 */
export async function issueInvite(
  event: H3Event,
  input: { id?: number; email: string; role: UserRole },
  inviter: { id: string; name: string },
): Promise<InviteCreated> {
  const token = randomToken()
  const values = {
    email: input.email,
    role: input.role,
    tokenHash: await sha256(token),
    invitedById: inviter.id,
    expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
  }
  const [invite] = input.id
    ? await db.update(schema.invites).set(values).where(eq(schema.invites.id, input.id)).returning()
    : await db.insert(schema.invites).values(values).returning()

  const link = `${siteOrigin(event)}/auth/register?invite=${token}`
  let emailed = false
  try {
    emailed = await sendMail(event, { to: input.email, subject: `${inviter.name} invited you to Ticketer`, ...inviteMail(link, inviter.name, input.role) })
  } catch (error) {
    log.error('invitation mail failed', error)
  }
  log.info('invitation issued', { inviteId: invite!.id, role: input.role, emailed })
  return { invite: inviteDTO(invite!, inviter.name), link, emailed }
}
