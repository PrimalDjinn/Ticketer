import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

/** Sends a delivery's event again now, as a new delivery. Test events can't be resent: send a new test instead. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { deliveryId } = await getValidatedRouterParams(event, z.object({ deliveryId: z.string().max(40) }).parse)
  const delivery = await db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, deliveryId) })
  if (!delivery) throw createError({ status: 404, message: 'Delivery not found' })
  if (delivery.eventType === 'webhook.test') throw createError({ status: 400, message: 'Send a new test instead' })
  return redeliver(event, delivery)
})
