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

  /** The service worker registration once it has an active worker (Firefox can be slow to activate a new one). */
  async function registration() {
    const reg = await withTimeout(navigator.serviceWorker.register('/sw.js', { scope: '/' }), 30_000, 'The notification service worker did not start')
    if (reg.active) return reg
    const worker = reg.installing ?? reg.waiting
    if (worker) {
      await withTimeout(
        new Promise<void>((resolve, reject) => {
          if (worker.state === 'activated') return resolve()
          worker.addEventListener('statechange', () => {
            if (worker.state === 'activated') resolve()
            else if (worker.state === 'redundant') reject(new Error('The notification service worker failed to install'))
          })
        }),
        30_000,
        'The notification service worker did not activate',
      )
    }
    return reg
  }

  const sameKey = (sub: PushSubscription, key: Uint8Array) => {
    const current = sub.options.applicationServerKey ? new Uint8Array(sub.options.applicationServerKey) : null
    return !!current && current.length === key.length && current.every((b, i) => b === key[i])
  }

  async function refresh() {
    if (import.meta.server) return
    supported.value = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
    permission.value = supported.value ? Notification.permission : 'unsupported'
    if (!supported.value) return (checked.value = true)
    const reg = await navigator.serviceWorker.getRegistration('/')
    let sub = await reg?.pushManager.getSubscription()
    if (reg && sub) {
      // The server's key can change (it is recreated if NUXT_APP_SECRET changes). A subscription made for the old key
      // can't receive anything, so make a new one for the current key while permission is still granted.
      const { publicKey } = await $fetch<{ publicKey: string }>('/api/push/key').catch(() => ({ publicKey: '' }))
      const expected = publicKey ? toBytes(publicKey) : null
      if (expected && sub.options.applicationServerKey && !sameKey(sub, expected)) {
        await sub.unsubscribe().catch(() => {})
        sub = Notification.permission === 'granted' ? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: expected }).catch(() => null) : null
      }
    }
    subscribed.value = !!sub
    // Keep the server's copy current (it may have been dropped after the push service expired it).
    if (sub) await $fetch('/api/push/subscriptions', { method: 'POST', body: sub.toJSON() }).catch(() => {})
    checked.value = true
  }

  async function enable() {
    busy.value = true
    try {
      // Ask first, while still inside the click: Firefox only shows the prompt for a direct user action.
      permission.value = await Notification.requestPermission()
      if (permission.value !== 'granted') return false
      try {
        const [{ publicKey }, reg] = await Promise.all([$fetch<{ publicKey: string }>('/api/push/key'), registration()])
        const key = toBytes(publicKey)
        let sub = await reg.pushManager.getSubscription()
        // A subscription made for an earlier server key can't receive anything (and Firefox refuses to subscribe again
        // with a different key while it exists): replace it.
        if (sub && !sameKey(sub, key)) {
          await sub.unsubscribe().catch(() => {})
          sub = null
        }
        sub ??= await withTimeout(reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key }), 30_000, 'The browser’s push service did not answer')
        await $fetch('/api/push/subscriptions', { method: 'POST', body: sub.toJSON() })
        subscribed.value = true
        return true
      } catch (error) {
        throw new Error(describePushError(error), { cause: error })
      }
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return Promise.race([promise, new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), ms))])
}

/** A message people can act on, with the browser's own wording kept for support. */
function describePushError(error: unknown) {
  const name = error instanceof Error ? error.name : ''
  const raw = error instanceof Error ? error.message : String(error)
  const firefox = navigator.userAgent.includes('Firefox')
  if (name === 'AbortError' || /push subscription|push service/i.test(raw)) {
    return firefox
      ? `Firefox couldn’t reach its push service (push.services.mozilla.com). A firewall, VPN, ad blocker or privacy setting may be blocking it. (${raw})`
      : `The browser couldn’t reach its push service. A firewall, VPN or privacy setting may be blocking it. (${raw})`
  }
  if (name === 'SecurityError' || /insecure/i.test(raw)) {
    return `This browser doesn’t let the site keep data, which push needs (private window, or “delete cookies and site data when closed”). (${raw})`
  }
  if (name === 'NotAllowedError') return `Notifications are blocked for this site. Allow them in the browser’s site settings. (${raw})`
  if (name === 'InvalidStateError') return `The browser has an old subscription for this site. Turn push off and on again. (${raw})`
  if (error && typeof error === 'object' && 'statusCode' in error) return `The server didn’t accept this browser’s subscription: ${errorMessage(error)}`
  return raw || 'Push notifications could not be turned on'
}
