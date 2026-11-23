import { and, eq, gt, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  token: z.string().min(16),
  password: z.string().min(8, 'Use at least 8 characters').max(200),
})

export default defineEventHandler(async (event) => {
  const { token, password } = await readValidatedBody(event, body.parse)
  const reset = await db.query.passwordResets.findFirst({
    where: and(
      eq(schema.passwordResets.tokenHash, await sha256(token)),
      isNull(schema.passwordResets.usedAt),
      gt(schema.passwordResets.expiresAt, new Date()),
    ),
  })
  if (!reset) throw createError({ status: 400, message: 'This reset link is invalid or has expired' })

  const [user] = await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, reset.userId))
    .returning()
  await db.update(schema.passwordResets).set({ usedAt: new Date() }).where(eq(schema.passwordResets.userId, reset.userId))

  await startSession(event, user!)
  return toPublicUser(user!)
})
