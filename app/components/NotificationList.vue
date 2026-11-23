<script setup lang="ts">
const emit = defineEmits<{ navigate: [] }>()
const { items, markRead, markAllRead, refresh } = useNotifications()
await refresh()

const permission = ref<NotificationPermission | 'unsupported'>('default')
onMounted(() => {
  permission.value = 'Notification' in window ? Notification.permission : 'unsupported'
})
async function enableDesktop() {
  permission.value = await Notification.requestPermission()
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
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <UAlert
      v-if="permission === 'default'"
      color="neutral"
      variant="subtle"
      icon="i-lucide-bell-ring"
      title="Get desktop alerts"
      description="See notifications even when this tab is in the background."
      :actions="[{ label: 'Enable', onClick: enableDesktop }]"
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
