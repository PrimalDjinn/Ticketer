import type { H3Event } from 'h3'
import { and, eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * `Idempotency-Key` on POST requests with a JSON body: the first response is kept for 24 hours and replayed for the
 * same key and body, so a caller can retry after a timeout without opening a second ticket. Errors aren't kept, so a
 * failed request can be retried with the same key. `scope` is who's asking (`token:<id>`, `app:<id>`).
 */
export async function withIdempotency<T>(event: H3Event, scope: string, run: () => Promise<T>): Promise<T> {
  const key = getRequestHeader(event, 'idempotency-key')?.trim()
  const isJson = (getRequestHeader(event, 'content-type') ?? '').includes('application/json')
  if (!key || event.method !== 'POST' || !isJson) return run()
  if (key.length > 255) throw createError({ status: 400, message: 'Idempotency-Key is longer than 255 characters', data: { code: 'invalid_idempotency_key' } })

  const raw = (await readRawBody(event, 'utf8')) ?? ''
  const requestHash = await sha256(`${event.method} ${event.path.split('?')[0]} ${raw}`)
  const where = and(eq(schema.idempotencyKeys.scope, scope), eq(schema.idempotencyKeys.key, key))

  // Reserve the key first (status 0), so two requests racing with the same key don't both act.
  const [reserved] = await db.insert(schema.idempotencyKeys).values({ scope, key, requestHash, status: 0 }).onConflictDoNothing().returning()
  if (!reserved) {
    const existing = await db.query.idempotencyKeys.findFirst({ where })
    if (existing && existing.requestHash !== requestHash) {
      throw createError({ status: 422, message: 'This Idempotency-Key was used with a different request', data: { code: 'idempotency_key_reused' } })
    }
    if (existing && existing.status === 0) {
      throw createError({ status: 409, message: 'A request with this Idempotency-Key is still running; retry in a moment', data: { code: 'idempotency_key_in_use' } })
    }
    if (existing) {
      setResponseStatus(event, existing.status)
      setHeader(event, 'Idempotent-Replayed', 'true')
      return existing.response as T
    }
  }
  try {
    const result = await run()
    await db.update(schema.idempotencyKeys).set({ status: getResponseStatus(event) || 200, response: result ?? null }).where(where)
    return result
  } catch (error) {
    await db.delete(schema.idempotencyKeys).where(where)
    throw error
  }
}
