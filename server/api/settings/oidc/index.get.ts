/** Settings → Sign-in: the effective single sign-on configuration and where each value comes from. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return oidcSettingsDTO(event)
})
