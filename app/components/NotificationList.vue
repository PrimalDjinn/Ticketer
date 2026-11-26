<script setup lang="ts">
const emit = defineEmits<{ navigate: [] }>()
const { items, markRead, markAllRead, refresh } = useNotifications()
await refresh()

const push = usePush()
const toast = useToast()
onMounted(() => push.refresh())
async function enablePush() {
  try {
    if (await push.enable()) toast.add({ title: 'Push notifications are on for this browser', color: 'success' })
    else toast.add({ title: 'Notifications are blocked for this site', description: 'Allow them in the browser’s site settings, then try again.', color: 'warning' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not turn on push notifications'), color: 'error' })
  }
}

async function open(n: NotificationDTO) {
  await markRead(n.id)
  if (n.link) {
    emit('navigate')
    await navigateTo(n.link)
  }
}

const icons: Record<string, string> = {
  mention: 'i-lucide-at-sign',
  comment: 'i-lucide-message-square',
  ticket: 'i-lucide-ticket',
  message: 'i-lucide-message-circle',
  task: 'i-lucide-square-check-big',
  reminder: 'i-lucide-alarm-clock',
  webhook: 'i-lucide-webhook',
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      v-if="push.checked.value && push.supported.value && !push.subscribed.value && push.permission.value !== 'denied'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-bell-ring"
      title="Get notified when Ticketer is closed"
      description="Push notifications reach this device even with no tab open."
      :actions="[{ label: 'Turn on', loading: push.busy.value, onClick: enablePush }]"
    />

    <div v-if="items.length" class="flex justify-end">
      <UButton size="xs" color="neutral" variant="link" icon="i-lucide-check-check" label="Mark all as read" @click="markAllRead" />
    </div>

    <UEmpty v-if="!items.length" icon="i-lucide-bell-off" title="You're all caught up" description="New mentions and ticket updates show up here." />

    <ul v-else class="divide-y divide-default">
      <li v-for="n in items" :key="n.id" class="group flex items-start gap-3 py-3">
        <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
          <UIcon :name="icons[n.type] ?? 'i-lucide-bell'" class="size-4" />
        </span>
        <button class="min-w-0 flex-1 text-left" @click="open(n)">
          <p class="text-sm text-highlighted">{{ n.message }}</p>
          <p class="text-xs text-muted"><NuxtTime v-if="n.createdAt" :datetime="n.createdAt" relative :title="formatDateTime(n.createdAt)" /></p>
        </button>
        <UButton size="xs" color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Dismiss" @click="markRead(n.id)" />
      </li>
    </ul>
  </div>
</template>
