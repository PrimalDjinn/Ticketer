import { and, count, desc, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const hooks = await db.select().from(schema.webhooks).orderBy(desc(schema.webhooks.createdAt))
  const pending = await db
    .select({ webhookId: schema.webhookDeliveries.webhookId, value: count() })
    .from(schema.webhookDeliveries)
    .where(and(eq(schema.webhookDeliveries.status, 'pending')))
    .groupBy(schema.webhookDeliveries.webhookId)
  return {
    events: WEBHOOK_EVENTS,
    allowPrivateNetwork: String(useRuntimeConfig().webhooks?.allowPrivateNetwork) === 'true',
    webhooks: hooks.map((h) => toWebhookDTO(h, { pending: pending.find((p) => p.webhookId === h.id)?.value ?? 0, failedRecently: 0 })),
  }
})
