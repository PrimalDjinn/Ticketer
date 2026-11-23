export function useNotifications() {
  const items = useState<NotificationDTO[]>('notifications', () => [])
  const { loggedIn } = useUserSession()

  async function refresh() {
    if (!loggedIn.value) {
      items.value = []
      return
    }
    items.value = await $fetch<NotificationDTO[]>('/api/notifications').catch(() => items.value)
  }

  async function markRead(id: number) {
    items.value = items.value.filter((n) => n.id !== id)
    await $fetch(`/api/notifications/${id}/read`, { method: 'POST' }).catch(() => {})
  }

  async function markAllRead() {
    items.value = []
    await $fetch('/api/notifications/read-all', { method: 'POST' }).catch(() => {})
  }

  return { items, refresh, markRead, markAllRead }
}

/** Installed once from the default layout: live notifications, toasts, sound and OS notifications when hidden. */
export function useNotificationFeed() {
  const { items, refresh } = useNotifications()
  const toast = useToast()

  onRealtime('notification', (notification) => {
    if (items.value.some((n) => n.id === notification.id)) return
    items.value = [notification, ...items.value]
    toast.add({
      title: notification.message,
      icon: 'i-lucide-bell',
      actions: notification.link ? [{ label: 'Open', to: notification.link, variant: 'outline' }] : undefined,
    })
    if (document.visibilityState === 'hidden') {
      new Audio('/notification.mp3').play().catch(() => {})
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Ticketer', { body: notification.message })
      }
    }
  })
  onRealtimeResync(refresh)

  return { items, refresh }
}
