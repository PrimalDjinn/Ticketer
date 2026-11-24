import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.string().regex(/^app_[0-9a-z]{26}$/) })

/** Replaces the API key and signing secret (the old ones stop working at once) and returns the new ones this once. */
export default defineEventHandler(async (event): Promise<IntegrationAppCredentials> => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const credentials = await newAppCredentials()
  const [row] = await db
    .update(schema.integrationApps)
    .set({ ...credentials.columns, rotatedAt: new Date() })
    .where(eq(schema.integrationApps.id, id))
    .returning()
  if (!row) throw createError({ status: 404, message: 'Integration not found' })
  useLogger('integrations').info('app credentials rotated', { appId: id, by: admin.id })
  const [app] = await appDTOs([row])
  return { app: app!, apiKey: credentials.apiKey, signingSecret: credentials.signingSecret }
})
