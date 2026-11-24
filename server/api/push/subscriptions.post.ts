import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({
  endpoint: z.url().max(2000).refine((v) => v.startsWith('https://'), 'Push endpoints use https'),
  keys: z.object({ p256dh: z.string().min(80).max(200), auth: z.string().min(16).max(64) }),
})

/** Registers this browser for Web Push. Re-subscribing the same browser moves it to the current person. */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const input = await readValidatedBody(event, body.parse)
  const userAgent = getHeader(event, 'user-agent')?.slice(0, 300) ?? null
  await db
    .insert(schema.pushSubscriptions)
    .values({ userId: user.id, endpoint: input.endpoint, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent })
    .onConflictDoUpdate({
      target: schema.pushSubscriptions.endpoint,
      set: { userId: user.id, p256dh: input.keys.p256dh, auth: input.keys.auth, userAgent },
    })
  return { ok: true }
})
