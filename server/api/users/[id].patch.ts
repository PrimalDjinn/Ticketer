import { and, eq, ne } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.string().min(1).max(64) })
const body = z.object({ role: z.enum(USER_ROLES) })

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const { role } = await readValidatedBody(event, body.parse)

  if (role !== 'admin') {
    const others = await db.query.users.findFirst({
      where: and(eq(schema.users.role, 'admin'), ne(schema.users.id, id)),
      columns: { id: true },
    })
    if (!others) throw createError({ status: 400, message: 'Keep at least one admin' })
  }
  const [user] = await db
    .update(schema.users)
    .set({ role })
    .where(and(eq(schema.users.id, id), eq(schema.users.isGuest, false)))
    .returning()
  if (!user) throw createError({ status: 404, message: 'User not found' })
  if (user.id === admin.id) await startSession(event, user)
  return toPublicUser(user)
})
