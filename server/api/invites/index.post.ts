import { and, eq, isNull } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  email: z.email('Enter a valid email').transform((v) => v.trim().toLowerCase()),
  role: z.enum(USER_ROLES).default('member'),
})

/** Invites someone by email. Inviting the same address again replaces the earlier, unused invitation. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { email, role } = await readValidatedBody(event, body.parse)

  const existing = await db.query.users.findFirst({
    where: and(eq(schema.users.email, email), eq(schema.users.isGuest, false)),
    columns: { id: true },
  })
  if (existing) throw createError({ status: 409, message: 'That person already has an account' })

  await db.delete(schema.invites).where(and(eq(schema.invites.email, email), isNull(schema.invites.acceptedAt)))
  setResponseStatus(event, 201)
  return issueInvite(event, { email, role }, admin)
})
