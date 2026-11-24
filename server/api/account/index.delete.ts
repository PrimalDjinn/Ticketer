import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  /** Required when the account has a password. */
  password: z.string().max(200).optional(),
  /** Required when it has none: the account's email (or username when there is no email). */
  confirm: z.string().trim().max(320).optional(),
  /** People may also delete the private tickets they opened; public issues stay, anonymised. */
  tickets: z.enum(['keep', 'delete-private']).default('keep'),
})

/** Deletes the signed-in person's own account and data, then signs them out. */
export default defineEventHandler(async (event) => {
  const session = await requireMember(event)
  const input = await readValidatedBody(event, body.parse)
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) })
  if (!user) throw createError({ status: 404, message: 'Account not found' })

  if (user.passwordHash) {
    if (!input.password || !(await verifyPassword(user.passwordHash, input.password))) {
      throw createError({ status: 403, message: 'That password is not right' })
    }
  } else {
    const expected = (user.email ?? user.name ?? '').toLowerCase()
    if (!expected || input.confirm?.toLowerCase() !== expected) {
      throw createError({ status: 403, message: `Type ${user.email ? 'your email address' : 'your username'} to confirm` })
    }
  }

  const summary = await deleteAccount(event, user.id, { tickets: input.tickets, via: 'self', actorId: user.id })
  await clearUserSession(event)
  return { ok: true, summary }
})
