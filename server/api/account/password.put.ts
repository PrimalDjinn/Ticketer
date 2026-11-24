import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  current: z.string().min(1, 'Enter your current password').max(200),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

/** Changes the signed-in person's password. Accounts without one (single sign-on) manage it at their provider. */
export default defineEventHandler(async (event) => {
  const session = await requireMember(event)
  const input = await readValidatedBody(event, body.parse)
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) })
  if (!user?.passwordHash) throw createError({ status: 400, message: 'This account signs in without a password' })
  if (!(await verifyPassword(user.passwordHash, input.current))) throw createError({ status: 403, message: 'Your current password is not right' })
  await db.update(schema.users).set({ passwordHash: await hashPassword(input.password) }).where(eq(schema.users.id, user.id))
  // Outstanding reset links would otherwise still work.
  await db.delete(schema.passwordResets).where(eq(schema.passwordResets.userId, user.id))
  useLogger('auth').info('password changed', { userId: user.id })
  return { ok: true }
})
