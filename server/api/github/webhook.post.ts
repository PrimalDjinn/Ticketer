import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

const log = useLogger('github')

/**
 * GitHub webhooks for the app: issues, issue comments and installations. The signature is checked against the app's
 * webhook secret; each delivery (X-GitHub-Delivery) is applied once. Failures answer 500 so the delivery shows as
 * failed in the app's "Advanced" tab on GitHub, where it can be redelivered.
 */
export default defineEventHandler(async (event) => {
  const config = await githubConfig(event)
  if (config.problem) throw createError({ status: 503, message: 'GitHub isn’t set up' })
  const body = (await readRawBody(event, 'utf8')) ?? ''
  if (!(await verifyWebhookSignature(config.webhookSecret, body, getHeader(event, 'x-hub-signature-256')))) {
    throw createError({ status: 401, message: 'Bad signature' })
  }
  const name = getHeader(event, 'x-github-event') ?? ''
  const delivery = getHeader(event, 'x-github-delivery')?.slice(0, 100)
  if (delivery) {
    const [fresh] = await db.insert(schema.githubDeliveries).values({ id: delivery }).onConflictDoNothing().returning()
    if (!fresh) return { ok: true, result: 'duplicate delivery' }
  }
  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    throw createError({ status: 400, message: 'Not JSON' })
  }
  try {
    const result = await handleGithubEvent(event, name, payload, config)
    if (!result.startsWith('ignored')) log.info(`${name}: ${result}`)
    return { ok: true, result }
  } catch (error) {
    if (delivery) await db.delete(schema.githubDeliveries).where(eq(schema.githubDeliveries.id, delivery)).catch(() => {})
    log.error(`${name} failed`, error instanceof Error ? error.message : String(error))
    throw createError({ status: 500, message: 'Could not apply this event' })
  }
})
