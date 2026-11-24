/** Settings → Reminders. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { ...(await reminderSettings()), siteOrigin: await knownSiteOrigin() }
})
