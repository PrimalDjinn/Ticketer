import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/** Revokes one of your tokens. It stops working at once. */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const { id } = await getValidatedRouterParams(event, z.object({ id: z.string().max(40) }).parse)
  const [row] = await db.delete(schema.apiTokens).where(and(eq(schema.apiTokens.id, id), eq(schema.apiTokens.userId, user.id))).returning()
  if (!row) throw createError({ status: 404, message: 'Token not found' })
  return { ok: true }
})
