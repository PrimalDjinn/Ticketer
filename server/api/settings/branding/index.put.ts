import { z } from 'zod'

const body = z.object({
  name: z.string().trim().max(60).optional(),
  accent: z.enum(ACCENT_COLOR_NAMES),
  website: z.union([z.literal(''), z.url({ protocol: /^https?$/, error: 'Enter a full address, e.g. https://example.com' })]),
})

export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const input = await readValidatedBody(event, body.parse)
  const current = await readBranding()
  // The name is pinned by NUXT_PUBLIC_APP_NAME when set; keep what is stored then.
  const name = useRuntimeConfig(event).public.appName ? current.name : (input.name ?? current.name)
  await setSetting('branding', { ...current, name, accent: input.accent, website: input.website })
  useLogger('settings').info('branding changed', { name, accent: input.accent })
  return siteInfo(event)
})
