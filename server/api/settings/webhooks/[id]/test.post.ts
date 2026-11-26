import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/** Sends a `webhook.test` event now and reports what the receiver answered. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, webhookIdParams.parse)
  const hook = await db.query.webhooks.findFirst({ where: eq(schema.webhooks.id, id) })
  if (!hook) throw createError({ status: 404, message: 'Webhook not found' })
  const result = await sendTestWebhook(hook)
  return { ok: result.status !== null && result.status >= 200 && result.status < 300, ...result }
})
