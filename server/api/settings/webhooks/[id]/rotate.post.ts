import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** A new signing secret, in this answer only. The old one stops at once. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, webhookIdParams.parse)
  const secret = newWebhookSecret()
  const [row] = await db.update(schema.webhooks).set({ secret: await encryptSecret(secret) }).where(eq(schema.webhooks.id, id)).returning()
  if (!row) throw createError({ status: 404, message: 'Webhook not found' })
  return { secret }
})
