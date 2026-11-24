import { and, eq, isNull } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Revokes an unused invitation; its link stops working. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, idParams.parse)
  const removed = await db
    .delete(schema.invites)
    .where(and(eq(schema.invites.id, id), isNull(schema.invites.acceptedAt)))
    .returning({ id: schema.invites.id })
  if (!removed.length) throw createError({ status: 404, message: 'Invitation not found' })
  return { ok: true }
})
