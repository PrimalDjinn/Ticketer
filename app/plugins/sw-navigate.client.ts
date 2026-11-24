/** The service worker asks an open tab to go to a page when a notification is clicked and it can't navigate it itself. */
export default defineNuxtPlugin(() => {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker.addEventListener('message', (event: MessageEvent) => {
    const data = event.data as { type?: unknown; url?: unknown } | null
    if (data?.type !== 'navigate' || typeof data.url !== 'string') return
    const url = new URL(data.url, window.location.origin)
    if (url.origin === window.location.origin) navigateTo(url.pathname + url.search + url.hash)
  })
})
