import { and, eq, ne, or } from 'drizzle-orm'
import { ulid } from 'ulid'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  email: z.email().transform((v) => v.trim().toLowerCase()),
  name: z.string().trim().regex(/^[a-zA-Z0-9_]{3,30}$/, 'Use 3-30 letters, numbers or underscores'),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, body.parse)
  const session = await getUserSession(event)
  const guestId = session.user?.isGuest ? session.user.id : undefined

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

  // The very first account administers the instance; later admins are promoted from the Users page.
  const existingMember = await db.query.users.findFirst({ where: eq(schema.users.isGuest, false), columns: { id: true } })
  const values = {
    email: input.email,
    name: input.name,
    passwordHash: await hashPassword(input.password),
    isGuest: false,
    isAdmin: !existingMember,
  }

  const [user] = guestId
    ? await db.update(schema.users).set(values).where(eq(schema.users.id, guestId)).returning()
    : await db.insert(schema.users).values({ id: ulid(), ...values }).returning()

  await startSession(event, user!)
  return toPublicUser(user!)
})
