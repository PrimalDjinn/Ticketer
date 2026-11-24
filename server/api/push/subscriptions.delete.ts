import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const body = z.object({ endpoint: z.url().max(2000) })

/** Stops Web Push to this browser. */
export default defineEventHandler(async (event) => {
  const user = await requireMember(event)
  const { endpoint } = await readValidatedBody(event, body.parse)
  await db.delete(schema.pushSubscriptions).where(and(eq(schema.pushSubscriptions.endpoint, endpoint), eq(schema.pushSubscriptions.userId, user.id)))
  return { ok: true }
})
