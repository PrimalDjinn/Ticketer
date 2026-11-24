import { blob } from 'hub:blob'

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const current = await readBranding()
  if (current.logo) {
    await setSetting('branding', { ...current, logo: null })
    await blob.del(current.logo).catch(() => {})
  }
  return siteInfo(event)
})
