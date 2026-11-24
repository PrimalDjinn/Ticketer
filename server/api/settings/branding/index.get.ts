/** Settings → Branding. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const branding = await readBranding()
  const envName = useRuntimeConfig(event).public.appName
  return { name: envName || branding.name, nameLocked: !!envName, logoUrl: logoUrl(branding), accent: branding.accent, website: branding.website }
})
