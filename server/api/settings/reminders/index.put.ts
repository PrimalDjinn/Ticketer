export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const settings = await readValidatedBody(event, reminderSettingsShape.parse)
  await setSetting('reminders', settings)
  useLogger('settings').info('reminder settings changed', settings)
  return settings
})
