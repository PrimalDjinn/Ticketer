import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** The signed-in person's account page: who they are, how they confirm a deletion, and what it would remove. */
export default defineEventHandler(async (event) => {
  const session = await requireMember(event)
  const user = await db.query.users.findFirst({ where: eq(schema.users.id, session.id) })
  if (!user) throw createError({ status: 404, message: 'Account not found' })
  return {
    user: toPublicUser(user),
    createdAt: user.createdAt,
    /** Accounts without a password (single sign-on, app-created) confirm by typing their email instead. */
    hasPassword: !!user.passwordHash,
    deletion: { blocker: await deletionBlocker(user), ...(await deletionPreview(user.id)) },
  }
})
