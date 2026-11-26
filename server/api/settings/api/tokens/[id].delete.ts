import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/** Admins: revoke anyone's token. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().max(40) }).parse)
  const [row] = await db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, id)).returning()
  if (!row) throw createError({ status: 404, message: 'Token not found' })
  useLogger('api').info('token revoked by an admin', { prefix: row.keyPrefix, owner: row.userId, by: admin.id })
  return { ok: true }
})
