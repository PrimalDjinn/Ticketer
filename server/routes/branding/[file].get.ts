import { blob } from 'hub:blob'
import { z } from 'zod'

const params = z.object({ file: z.string().regex(/^logo-[a-z0-9]+\.(png|jpe?g|webp|svg)$/) })

/** The logo from Settings → Branding. Public; file names change with each upload, so it can be cached for good. */
export default defineEventHandler(async (event) => {
  const { file } = await getValidatedRouterParams(event, params.parse)
  const branding = await readBranding()
  if (branding.logo !== `branding/${file}`) throw createError({ status: 404, message: 'Not found' })
  setHeader(event, 'cache-control', 'public, max-age=31536000, immutable')
  setHeader(event, 'x-content-type-options', 'nosniff')
  // SVGs can carry scripts: never let one run when opened directly.
  setHeader(event, 'content-security-policy', "default-src 'none'; style-src 'unsafe-inline'; img-src data:")
  return blob.serve(event, branding.logo)
})
