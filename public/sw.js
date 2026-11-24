// Ticketer service worker: shows Web Push notifications when no Ticketer tab is in front of you, and opens the
// right page when one is clicked. It caches nothing.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let message = { title: 'Ticketer', body: '', link: '/', tag: undefined }
  try {
    message = { ...message, ...event.data.json() }
  } catch {
    if (event.data) message.body = event.data.text()
  }
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      // A focused, visible tab already shows the notification in the app (toast, bell, sound).
      if (windows.some((w) => w.focused && w.visibilityState === 'visible')) return
      await self.registration.showNotification(message.title, {
        body: message.body,
        tag: message.tag,
        renotify: !!message.tag,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        data: { link: message.link || '/' },
      })
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.link || '/', self.location.origin).href
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (existing) {
        await existing.focus()
        if ('navigate' in existing) await existing.navigate(target).catch(() => existing.postMessage({ type: 'navigate', url: target }))
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})
