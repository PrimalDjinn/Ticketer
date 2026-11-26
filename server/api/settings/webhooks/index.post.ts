import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

/** Creates a webhook. The signing secret is in this answer only. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = await readValidatedBody(event, webhookInputShape.parse)
  await checkWebhookUrl(input.url)
  const secret = newWebhookSecret()
  const [row] = await db
    .insert(schema.webhooks)
    .values({ id: `wh_${ulid().toLowerCase()}`, ...input, events: input.events.includes('*') ? ['*'] : [...new Set(input.events)], secret: await encryptSecret(secret), createdById: admin.id })
    .returning()
  useLogger('webhooks').info('webhook created', { webhook: row!.id, by: admin.id, events: row!.events })
  return { webhook: toWebhookDTO(row!), secret }
})
