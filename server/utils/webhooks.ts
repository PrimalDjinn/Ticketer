import type { H3Event } from 'h3'
import { and, desc, eq, inArray, lte } from 'drizzle-orm'
import { ulid } from 'ulid'
import { db, schema } from 'hub:db'

/**
 * Outgoing webhooks in the Standard Webhooks format (https://www.standardwebhooks.com): `webhook-id`,
 * `webhook-timestamp` and `webhook-signature: v1,<base64 HMAC-SHA256 of "id.timestamp.body">` keyed with the
 * base64-decoded part of the `whsec_` secret. Receivers can verify with the `standardwebhooks` libraries.
 *
 * Delivery: the first attempt right after the change; retries 1 min, 5 min, 30 min, 2 h, 5 h, 10 h and 24 h later, run
 * by the every-minute `webhooks:deliver` task. A 2xx is success; a redirect is a failure; 410 turns the webhook off; a
 * webhook failing for 3 days is turned off and admins are told.
 */
const log = useLogger('webhooks')

type WebhookRow = typeof schema.webhooks.$inferSelect
type DeliveryRow = typeof schema.webhookDeliveries.$inferSelect

const MINUTE = 60_000
const RETRY_DELAYS = [MINUTE, 5 * MINUTE, 30 * MINUTE, 120 * MINUTE, 300 * MINUTE, 600 * MINUTE, 1440 * MINUTE]
const TIMEOUT_MS = 10_000
const GIVE_UP_AFTER_MS = 3 * 86_400_000
/** A claimed delivery is retried after this if the server stopped mid-attempt. */
const LEASE_MS = 2 * MINUTE

// ---------------------------------------------------------------------------------------------------------------------
// Secrets and signatures
// ---------------------------------------------------------------------------------------------------------------------

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

export function newWebhookSecret() {
  return `whsec_${toBase64(crypto.getRandomValues(new Uint8Array(24)))}`
}

/** `v1,<signature>` for the `webhook-signature` header. */
export async function signWebhook(secret: string, id: string, timestamp: number, body: string) {
  const key = await crypto.subtle.importKey('raw', fromBase64(secret.replace(/^whsec_/, '')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${body}`))
  return `v1,${toBase64(new Uint8Array(mac))}`
}

// ---------------------------------------------------------------------------------------------------------------------
// Where we may send
// ---------------------------------------------------------------------------------------------------------------------

function allowPrivateNetwork() {
  return useRuntimeConfig().webhooks?.allowPrivateNetwork === true || String(useRuntimeConfig().webhooks?.allowPrivateNetwork) === 'true'
}

/** Loopback, private, link-local, carrier-grade NAT and unique-local addresses (IPv4, IPv6, IPv4-mapped IPv6). */
export function isPrivateAddress(address: string) {
  const ip = address.replace(/^\[|\]$/g, '').toLowerCase()
  const v4 = ip.match(/^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)
  }
  if (ip.includes(':')) return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip)
  return false
}

/** Why `url` can't receive webhooks, or null. Private addresses only with NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK=true. */
export async function webhookUrlProblem(url: string): Promise<string | null> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'Not a valid URL'
  }
  const privateOk = allowPrivateNetwork()
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && privateOk)) return 'Use an https:// address'
  if (parsed.username || parsed.password) return 'Leave user names and passwords out of the address'
  if (privateOk) return null
  const host = parsed.hostname
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal') || isPrivateAddress(host)) {
    return 'Private and local addresses are blocked. A server admin can allow them with NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK=true.'
  }
  // On Node, also check what the name resolves to. Workers can't reach private networks, and may not offer DNS here.
  try {
    const dns = await import('node:dns/promises')
    const addresses = await dns.lookup(host, { all: true })
    if (addresses.some((a) => isPrivateAddress(a.address))) {
      return 'This address resolves to a private network. A server admin can allow that with NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK=true.'
    }
  } catch {
    // Unresolvable names fail at delivery, with the error in the log.
  }
  return null
}

// ---------------------------------------------------------------------------------------------------------------------
// Queue and delivery
// ---------------------------------------------------------------------------------------------------------------------

function subscribed(webhook: WebhookRow, type: string) {
  return webhook.events.includes('*') || webhook.events.includes(type)
}

/** Called for each new event (utils/events.ts): one delivery per subscribed webhook, first attempt straight away. */
export async function queueWebhookDeliveries(event: H3Event, row: EventRow) {
  const hooks = (await db.select().from(schema.webhooks).where(eq(schema.webhooks.enabled, true))).filter(
    (hook) => subscribed(hook, row.type) && (hook.includeNotes || !isInternalNoteEvent(row)),
  )
  if (!hooks.length) return
  const now = new Date()
  const deliveries = await db
    .insert(schema.webhookDeliveries)
    .values(hooks.map((hook) => ({ id: ulid(), webhookId: hook.id, eventId: row.id, eventType: row.type, nextAttemptAt: new Date(now.getTime() + LEASE_MS) })))
    .returning()
  // Claimed with a lease from the start, so the minute job leaves them alone while this attempt runs.
  event.waitUntil(Promise.all(deliveries.map((delivery) => attempt(event, delivery, hooks.find((h) => h.id === delivery.webhookId)!, row))))
}

/** The JSON body for `row` as this webhook may see it. */
export function webhookPayload(hook: Pick<WebhookRow, 'includeNotes' | 'includeEmails'>, row: EventRow) {
  let dto = toEventDTO(row)
  if (!hook.includeNotes) dto = { ...dto, data: withoutNotePreview(dto.data) }
  if (!hook.includeEmails) dto = withoutEmails(dto)
  return JSON.stringify({ type: row.type, timestamp: new Date(row.occurredAt).toISOString(), data: dto })
}

interface SendResult {
  status: number | null
  ms: number
  excerpt: string
}

/** One HTTP attempt. Never throws. */
export async function sendWebhook(hook: WebhookRow, id: string, body: string): Promise<SendResult> {
  const started = Date.now()
  const problem = await webhookUrlProblem(hook.url)
  if (problem) return { status: null, ms: 0, excerpt: `Not sent: ${problem}` }
  const secret = await decryptSecret(hook.secret)
  if (!secret) return { status: null, ms: 0, excerpt: 'Not sent: the secret can’t be decrypted (was NUXT_APP_SECRET changed?). Rotate the secret.' }
  const timestamp = Math.floor(Date.now() / 1000)
  try {
    const response = await fetch(hook.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Ticketer-Webhooks/1',
        'webhook-id': id,
        'webhook-timestamp': String(timestamp),
        'webhook-signature': await signWebhook(secret, id, timestamp, body),
      },
      body,
    })
    const text = await response.text().catch(() => '')
    return { status: response.status, ms: Date.now() - started, excerpt: text.slice(0, 2000) }
  } catch (error) {
    const message = error instanceof Error ? (error.name === 'TimeoutError' ? `No answer within ${TIMEOUT_MS / 1000} s` : error.message) : String(error)
    return { status: null, ms: Date.now() - started, excerpt: message.slice(0, 2000) }
  }
}

async function attempt(event: H3Event, delivery: DeliveryRow, hook: WebhookRow, row: EventRow) {
  const result = await sendWebhook(hook, row.id, webhookPayload(hook, row))
  const ok = result.status !== null && result.status >= 200 && result.status < 300
  const attempts = delivery.attempts + 1
  const now = new Date()
  let next: Date | null = null
  if (!ok && attempts <= RETRY_DELAYS.length && result.status !== 410) {
    next = new Date(now.getTime() + RETRY_DELAYS[attempts - 1]!)
  }
  await db
    .update(schema.webhookDeliveries)
    .set({
      status: ok ? 'success' : next ? 'pending' : 'failed',
      attempts,
      nextAttemptAt: next,
      responseStatus: result.status,
      responseMs: result.ms,
      responseExcerpt: result.excerpt,
      updatedAt: now,
    })
    .where(eq(schema.webhookDeliveries.id, delivery.id))

  if (ok) {
    if (hook.failingSince || !hook.lastSuccessAt || now.getTime() - hook.lastSuccessAt.getTime() > MINUTE) {
      await db.update(schema.webhooks).set({ lastSuccessAt: now, failingSince: null }).where(eq(schema.webhooks.id, hook.id))
    }
    return
  }
  log.warn('delivery failed', { webhook: hook.id, event: row.id, attempt: attempts, status: result.status, error: result.status ? undefined : result.excerpt })
  if (result.status === 410) return disable(event, hook, 'The receiver answered 410 Gone')
  const failingSince = hook.failingSince ?? now
  if (!hook.failingSince) await db.update(schema.webhooks).set({ failingSince }).where(eq(schema.webhooks.id, hook.id))
  if (now.getTime() - failingSince.getTime() > GIVE_UP_AFTER_MS) await disable(event, hook, 'Every delivery failed for 3 days')
}

async function disable(event: H3Event, hook: WebhookRow, reason: string) {
  const [updated] = await db
    .update(schema.webhooks)
    .set({ enabled: false, disabledReason: reason })
    .where(and(eq(schema.webhooks.id, hook.id), eq(schema.webhooks.enabled, true)))
    .returning()
  if (!updated) return
  await db
    .update(schema.webhookDeliveries)
    .set({ status: 'failed', nextAttemptAt: null, updatedAt: new Date() })
    .where(and(eq(schema.webhookDeliveries.webhookId, hook.id), eq(schema.webhookDeliveries.status, 'pending')))
  log.warn('webhook turned off', { webhook: hook.id, reason })
  await notify(event, await adminIds(), { type: 'webhook', message: `Webhook “${hook.name}” was turned off: ${reason}`, link: '/settings/webhooks' })
}

/** Runs deliveries whose next attempt is due (the every-minute job). Each is claimed first, so runs never overlap. */
export async function processDueDeliveries(event: H3Event, limit = 50) {
  const now = new Date()
  const due = await db
    .select()
    .from(schema.webhookDeliveries)
    .where(and(eq(schema.webhookDeliveries.status, 'pending'), lte(schema.webhookDeliveries.nextAttemptAt, now)))
    .limit(limit)
  if (!due.length) return { attempted: 0 }
  const claimed: DeliveryRow[] = []
  for (const delivery of due) {
    const [row] = await db
      .update(schema.webhookDeliveries)
      .set({ nextAttemptAt: new Date(now.getTime() + LEASE_MS) })
      .where(and(eq(schema.webhookDeliveries.id, delivery.id), eq(schema.webhookDeliveries.nextAttemptAt, delivery.nextAttemptAt!)))
      .returning()
    if (row) claimed.push(delivery)
  }
  const hooks = await db.select().from(schema.webhooks).where(inArray(schema.webhooks.id, [...new Set(claimed.map((d) => d.webhookId))]))
  const rows = await eventsById([...new Set(claimed.map((d) => d.eventId))])
  await Promise.all(
    claimed.map(async (delivery) => {
      const hook = hooks.find((h) => h.id === delivery.webhookId)
      const row = rows.find((r) => r.id === delivery.eventId)
      if (!hook?.enabled || !row) {
        await db.update(schema.webhookDeliveries).set({ status: 'failed', nextAttemptAt: null, responseExcerpt: hook ? 'The event expired' : null, updatedAt: new Date() }).where(eq(schema.webhookDeliveries.id, delivery.id))
        return
      }
      await attempt(event, delivery, hook, row)
    }),
  )
  return { attempted: claimed.length }
}

/** Sends a delivery again now, whatever its state (the Redeliver button). */
export async function redeliver(event: H3Event, delivery: DeliveryRow) {
  const hook = await db.query.webhooks.findFirst({ where: eq(schema.webhooks.id, delivery.webhookId) })
  const [row] = await eventsById([delivery.eventId])
  if (!hook) throw createError({ status: 404, message: 'Webhook not found' })
  if (!row) throw createError({ status: 410, message: 'This event is older than 30 days and was removed' })
  const [fresh] = await db
    .insert(schema.webhookDeliveries)
    .values({ id: ulid(), webhookId: hook.id, eventId: row.id, eventType: row.type, nextAttemptAt: new Date(Date.now() + LEASE_MS) })
    .returning()
  await attempt(event, fresh!, hook, row)
  return db.query.webhookDeliveries.findFirst({ where: eq(schema.webhookDeliveries.id, fresh!.id) })
}

/** A `webhook.test` event, sent once (not stored or retried), so admins can check their receiver. */
export async function sendTestWebhook(hook: WebhookRow) {
  const id = `evt_${ulid().toLowerCase()}`
  const body = JSON.stringify({
    type: 'webhook.test',
    timestamp: new Date().toISOString(),
    data: { id, type: 'webhook.test', occurredAt: new Date(), actor: { type: 'system', id: null, name: null }, subject: { type: 'webhook', id: hook.id }, data: { name: hook.name }, changes: null },
  })
  const result = await sendWebhook(hook, id, body)
  await db.insert(schema.webhookDeliveries).values({
    id: ulid(),
    webhookId: hook.id,
    eventId: id,
    eventType: 'webhook.test',
    status: result.status !== null && result.status >= 200 && result.status < 300 ? 'success' : 'failed',
    attempts: 1,
    responseStatus: result.status,
    responseMs: result.ms,
    responseExcerpt: result.excerpt,
    updatedAt: new Date(),
  })
  return result
}

export function toWebhookDTO(hook: WebhookRow, stats?: { pending: number; failedRecently: number }) {
  return {
    id: hook.id,
    name: hook.name,
    url: hook.url,
    events: hook.events,
    includeNotes: hook.includeNotes,
    includeEmails: hook.includeEmails,
    enabled: hook.enabled,
    disabledReason: hook.disabledReason,
    failingSince: hook.failingSince,
    lastSuccessAt: hook.lastSuccessAt,
    createdAt: hook.createdAt,
    pending: stats?.pending ?? 0,
  }
}

export async function recentDeliveries(webhookId: string, limit = 50) {
  return db
    .select()
    .from(schema.webhookDeliveries)
    .where(eq(schema.webhookDeliveries.webhookId, webhookId))
    .orderBy(desc(schema.webhookDeliveries.id))
    .limit(limit)
}
