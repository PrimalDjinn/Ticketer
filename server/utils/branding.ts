import type { H3Event } from 'h3'
import { z } from 'zod'

/**
 * Settings → Branding: the organisation's name, logo, accent colour and website, shown in the app, on the public
 * pages and in emails. NUXT_PUBLIC_APP_NAME pins the name.
 */
export const brandingShape = z.object({
  name: z.string().trim().max(60).default(''),
  /** Blob pathname under `branding/`, served publicly by /branding/<file>. */
  logo: z.string().nullable().default(null),
  accent: z.enum(ACCENT_COLOR_NAMES).default('indigo'),
  website: z.string().default(''),
})
export type Branding = z.output<typeof brandingShape>

export async function readBranding(): Promise<Branding> {
  return (await getSetting('branding', brandingShape)) ?? brandingShape.parse({})
}

/** NUXT_PUBLIC_APP_NAME, else the name from Settings, else "Ticketer". */
export function brandName(branding: Pick<Branding, 'name'>, event?: H3Event) {
  return (event ? useRuntimeConfig(event) : useRuntimeConfig()).public.appName || branding.name || 'Ticketer'
}

export function logoUrl(branding: Pick<Branding, 'logo'>) {
  return branding.logo ? `/branding/${branding.logo.replace(/^branding\//, '')}` : null
}

export async function siteInfo(event: H3Event): Promise<SiteInfo> {
  const [branding, captcha] = await Promise.all([readBranding(), publicCaptcha(event)])
  return { name: brandName(branding, event), logoUrl: logoUrl(branding), accent: branding.accent, website: branding.website || null, captcha }
}

/** Name, colour and (absolute, raster-only) logo for email templates. */
export async function mailBrand() {
  const branding = await readBranding()
  const origin = branding.logo && !branding.logo.endsWith('.svg') ? await knownSiteOrigin() : null
  return { name: brandName(branding), color: ACCENT_COLORS[branding.accent], logoUrl: origin ? `${origin}${logoUrl(branding)}` : null }
}
