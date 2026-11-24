import { db, schema } from 'hub:db'

/** Creates an app. The API key and signing secret are returned this once. */
export default defineEventHandler(async (event): Promise<IntegrationAppCredentials> => {
  const admin = await requireAdmin(event)
  const input = await readValidatedBody(event, appInputShape.parse)
  const credentials = await newAppCredentials()
  const [row] = await db
    .insert(schema.integrationApps)
    .values({
      id: newAppId(),
      name: input.name,
      allowedOrigins: input.allowedOrigins ?? [],
      landing: input.landing ?? 'new-ticket',
      canProvision: input.canProvision ?? true,
      canDelete: input.canDelete ?? false,
      createdById: admin.id,
      ...credentials.columns,
    })
    .returning()
  useLogger('integrations').info('app created', { appId: row!.id, name: row!.name, by: admin.id })
  const [app] = await appDTOs([row!])
  return { app: app!, apiKey: credentials.apiKey, signingSecret: credentials.signingSecret }
})
