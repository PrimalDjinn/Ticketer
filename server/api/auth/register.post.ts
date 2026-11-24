import { and, eq, ne, or } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Use 3-30 letters, numbers or underscores'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
  /** Token from an invitation link. */
  invite: z.string().trim().min(16).max(128).optional(),
})

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, body.parse)
  const session = await getUserSession(event)
  const guestId = session.user?.isGuest ? session.user.id : undefined

  // Decide the role first: the very first account administers the instance; after that people need an invitation
  // unless an admin has opened sign-up.
  let role: UserRole
  let inviteId: number | undefined
  if (input.invite) {
    const found = await findInvite(input.invite)
    if (!found.ok) throw createError({ status: 400, message: found.error })
    if (found.invite.email !== input.email) {
      throw createError({ status: 400, message: `This invitation is for ${found.invite.email}` })
    }
    role = found.invite.role
    inviteId = found.invite.id
  } else if (await isFirstAccount()) {
    role = 'admin'
  } else {
    const mode = await getSignupMode()
    if (mode === 'invite') throw createError({ status: 403, message: 'Joining is by invitation only. Ask an admin to invite you.' })
    role = mode
  }

  const taken = await db.query.users.findFirst({
    where: and(
      or(eq(schema.users.email, input.email), eq(schema.users.name, input.name)),
      guestId ? ne(schema.users.id, guestId) : undefined,
    ),
    columns: { email: true },
  })
  if (taken) {
    throw createError({ status: 409, message: taken.email === input.email ? 'That email is already registered' : 'That username is taken' })
  }

  if (inviteId !== undefined && !(await claimInvite(inviteId))) {
    throw createError({ status: 400, message: 'This invitation has already been used. Sign in instead.' })
  }

  const values = {
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    isGuest: false,
    role,
  }

  const [user] = guestId
    ? await db.update(schema.users).set(values).where(eq(schema.users.id, guestId)).returning()
    : await db.insert(schema.users).values({ id: ulid(), ...values }).returning()

  if (inviteId !== undefined) await markInviteAccepted(inviteId, user!.id)
  await startSession(event, user!)
  return toPublicUser(user!)
})
