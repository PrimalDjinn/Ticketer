import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.string().regex(/^app_[0-9a-z]{26}$/) })

/** Deletes an app: its key stops working at once, its login links and account links go. People and tickets stay. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const [row] = await db.delete(schema.integrationApps).where(eq(schema.integrationApps.id, id)).returning({ id: schema.integrationApps.id })
  if (!row) throw createError({ status: 404, message: 'Integration not found' })
  await forgetAppIdentities(id)
  useLogger('integrations').info('app deleted', { appId: id, by: admin.id })
  return { ok: true }
})
