/**
 * Web Push in this browser: notifications even when every Ticketer tab is closed. State is shared so the
 * notifications panel, the Account page and the live feed agree.
 */
export function usePush() {
  const supported = useState('push-supported', () => false)
  const permission = useState<NotificationPermission | 'unsupported'>('push-permission', () => 'default')
  const subscribed = useState('push-subscribed', () => false)
  const busy = useState('push-busy', () => false)
  const checked = useState('push-checked', () => false)

  const toBytes = (base64url: string) => {
    const padded = base64url.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (base64url.length % 4)) % 4)
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  }

  async function registration() {
    return navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(() => navigator.serviceWorker.ready)
  }

  async function refresh() {
    if (import.meta.server) return
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    permission.value = supported.value ? Notification.permission : 'unsupported'
    if (!supported.value) return (checked.value = true)
    const reg = await navigator.serviceWorker.getRegistration('/')
    const sub = await reg?.pushManager.getSubscription()
    subscribed.value = !!sub
    // Keep the server's copy current (it may have been dropped after the push service expired it).
    if (sub) await $fetch('/api/push/subscriptions', { method: 'POST', body: sub.toJSON() }).catch(() => {})
    checked.value = true
  }

  async function enable() {
    busy.value = true
    try {
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') return false
      const { publicKey } = await $fetch<{ publicKey: string }>('/api/push/key')
      const reg = await registration()
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(publicKey) }))
      await $fetch('/api/push/subscriptions', { method: 'POST', body: sub.toJSON() })
      subscribed.value = true
      return true
    } finally {
      busy.value = false
    }
  }

  async function disable() {
    busy.value = true
    try {
      const reg = await navigator.serviceWorker.getRegistration('/')
      const sub = await reg?.pushManager.getSubscription()
      if (sub) {
        await $fetch('/api/push/subscriptions', { method: 'DELETE', body: { endpoint: sub.endpoint } }).catch(() => {})
        await sub.unsubscribe()
      }
      subscribed.value = false
    } finally {
      busy.value = false
    }
  }

  return { supported, permission, subscribed, busy, checked, refresh, enable, disable }
}
