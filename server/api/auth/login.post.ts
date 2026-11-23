import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const { email, password } = await readValidatedBody(event, body.parse)
  const user = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
  const ok = user?.passwordHash ? await verifyPassword(user.passwordHash, password) : false
  if (!user || !ok) throw createError({ status: 401, message: 'Wrong email or password' })

  if (passwordNeedsReHash(user.passwordHash!)) {
    await db.update(schema.users).set({ passwordHash: await hashPassword(password) }).where(eq(schema.users.id, user.id))
  }
  await startSession(event, user)
  return toPublicUser(user)
})
