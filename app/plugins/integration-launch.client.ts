/**
 * Apps that send people here with the "support chat" landing open `/?support=chat`: open the chat widget and drop the
 * parameter so a reload does not reopen it.
 */
export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  const check = () => {
    const route = router.currentRoute.value
    if (route.query.support !== 'chat') return
    openSupportChat()
    const { support: _, ...query } = route.query
    void router.replace({ path: route.path, query, hash: route.hash })
  }
  nuxtApp.hook('app:suspense:resolve', check)
  router.afterEach(() => {
    if (!nuxtApp.isHydrating) check()
  })
})
