/** Instance settings for the admin Members page. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  return { signup: await getSignupMode() }
})
