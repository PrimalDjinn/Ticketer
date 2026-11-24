import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { db, schema } from 'hub:db'

const params = z.object({ id: z.string().regex(/^app_[0-9a-z]{26}$/) })

/** Renames an app, changes its origins, landing or account creation, or turns it off and on. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const { id } = await getValidatedRouterParams(event, params.parse)
  const input = await readValidatedBody(event, appInputShape.partial().extend({ enabled: z.boolean().optional() }).parse)
  const [row] = await db
    .update(schema.integrationApps)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.allowedOrigins !== undefined && { allowedOrigins: input.allowedOrigins }),
      ...(input.landing !== undefined && { landing: input.landing }),
      ...(input.canProvision !== undefined && { canProvision: input.canProvision }),
      ...(input.canDelete !== undefined && { canDelete: input.canDelete }),
      ...(input.enabled !== undefined && { enabled: input.enabled }),
    })
    .where(eq(schema.integrationApps.id, id))
    .returning()
  if (!row) throw createError({ status: 404, message: 'Integration not found' })
  useLogger('integrations').info('app updated', { appId: id, by: admin.id, fields: Object.keys(input) })
  return (await appDTOs([row]))[0]!
})
