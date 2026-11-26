import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, webhookIdParams.parse)
  const [row] = await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id)).returning()
  if (!row) throw createError({ status: 404, message: 'Webhook not found' })
  return { ok: true }
})
