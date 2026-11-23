import { sql } from 'drizzle-orm'
import { db } from 'hub:db'

/** Liveness + database reachability, for container healthchecks and uptime monitors. */
export default defineEventHandler(async (event) => {
  setHeader(event, 'cache-control', 'no-store')
  try {
    await db.run(sql`select 1`)
    return { ok: true }
  } catch (error) {
    setResponseStatus(event, 503)
    return { ok: false, error: (error as Error).message }
  }
})
