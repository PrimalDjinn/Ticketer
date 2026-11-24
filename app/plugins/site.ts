/**
 * Loads the site's branding and bot-protection widget settings once per visit (during server rendering; the browser
 * reuses the payload) and applies them: accent colour, browser tab title and icon.
 */
export default defineNuxtPlugin(async () => {
  const site = useState<SiteInfo | null>('site', () => null)
  if (!site.value) {
    try {
      site.value = await $fetch<SiteInfo>('/api/public/site')
    } catch {
      site.value = { name: useRuntimeConfig().public.appName || 'Ticketer', logoUrl: null, accent: 'indigo', website: null, captcha: null }
    }
  }

  const appConfig = useAppConfig()
  watch(
    () => site.value?.accent,
    (accent) => {
      if (accent) appConfig.ui.colors.primary = accent
    },
    { immediate: true },
  )

  useHead({
    titleTemplate: (title) => {
      const name = site.value?.name ?? 'Ticketer'
      return title && title !== name ? `${title} · ${name}` : name
    },
    link: computed(() => (site.value?.logoUrl ? [{ rel: 'icon', href: site.value.logoUrl, key: 'favicon' }] : [{ rel: 'icon', href: '/favicon.ico', key: 'favicon' }])),
  })
})
