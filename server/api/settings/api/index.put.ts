/** Admins: allow or stop personal access tokens. Turning them off stops every token until they're on again. */
export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event)
  const input = await readValidatedBody(event, apiTokenSettingsShape.parse)
  await setSetting('apiTokens', input)
  useLogger('api').info('access tokens setting changed', { enabled: input.enabled, by: admin.id })
  return input
})
