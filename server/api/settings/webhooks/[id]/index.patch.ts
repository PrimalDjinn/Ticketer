import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = webhookInputShape.partial().extend({ enabled: z.boolean().optional() })

/** Edits a webhook, or turns it on or off. Turning it on clears the reason it was turned off. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, webhookIdParams.parse)
  const input = await readValidatedBody(event, body.parse)
  if (input.url) await checkWebhookUrl(input.url)
  const patch: Partial<typeof schema.webhooks.$inferInsert> = { ...input }
  if (input.events) patch.events = input.events.includes('*') ? ['*'] : [...new Set(input.events)]
  if (input.enabled === true) Object.assign(patch, { disabledReason: null, failingSince: null })
  const [row] = await db.update(schema.webhooks).set(patch).where(eq(schema.webhooks.id, id)).returning()
  if (!row) throw createError({ status: 404, message: 'Webhook not found' })
  return toWebhookDTO(row)
})
