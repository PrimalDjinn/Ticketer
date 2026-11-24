/** Branding and public-form settings for this site (loaded by app/plugins/site.ts). */
export function useSite() {
  const state = useState<SiteInfo | null>('site')
  const site = computed<SiteInfo>(() => state.value ?? { name: 'Ticketer', logoUrl: null, accent: 'indigo', website: null, captcha: null })
  async function refreshSite(next?: SiteInfo) {
    state.value = next ?? (await $fetch<SiteInfo>('/api/public/site'))
  }
  return { site, refreshSite }
}
