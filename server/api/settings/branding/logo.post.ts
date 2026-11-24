import { blob } from 'hub:blob'

const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg' }
const MAX_BYTES = 512 * 1024

/** Uploads a new logo (PNG, JPEG, WebP or SVG, up to 512 KB) and removes the previous one. */
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const form = await readFormData(event)
  const file = form.get('logo')
  if (!file || typeof file === 'string' || !file.size) throw createError({ status: 400, message: 'Choose an image' })
  const ext = TYPES[file.type]
  if (!ext) throw createError({ status: 400, message: 'Use a PNG, JPEG, WebP or SVG image' })
  if (file.size > MAX_BYTES) throw createError({ status: 400, message: 'Use an image under 512 KB' })

  const pathname = `branding/logo-${randomToken(8)}.${ext}`
  await blob.put(pathname, file, { contentType: file.type })
  const current = await readBranding()
  await setSetting('branding', { ...current, logo: pathname })
  if (current.logo) await blob.del(current.logo).catch(() => {})
  return siteInfo(event)
})
