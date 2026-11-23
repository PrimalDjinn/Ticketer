<script setup lang="ts">
defineProps<{ title: string }>()

const { items } = useNotifications()
const open = useState('notifications-open', () => false)
const { status, transport } = useRealtime()

const connection = computed(() => {
  if (status.value === 'open') {
    const via = transport.value === 'websocket' ? 'WebSocket' : transport.value === 'sse' ? 'event stream' : 'long polling'
    return { dot: 'bg-success', label: `Live updates via ${via}` }
  }
  if (status.value === 'connecting' || status.value === 'reconnecting') return { dot: 'bg-warning animate-pulse', label: 'Reconnecting…' }
  return { dot: 'bg-dimmed', label: 'Live updates off' }
})
</script>

<template>
  <UDashboardNavbar :title="title">
    <template #leading>
      <UDashboardSidebarCollapse />
    </template>
    <template v-if="$slots.title" #title>
      <slot name="title" />
    </template>
    <template #right>
      <slot name="right" />
      <ClientOnly>
        <UTooltip :text="connection.label">
          <span class="grid size-8 place-items-center" :aria-label="connection.label">
            <span class="size-2 rounded-full" :class="connection.dot" />
          </span>
        </UTooltip>
      </ClientOnly>
      <UTooltip text="Notifications">
        <UButton color="neutral" variant="ghost" square aria-label="Notifications" @click="open = true">
          <UChip :show="items.length > 0" color="error" inset>
            <UIcon name="i-lucide-bell" class="size-5 shrink-0" />
          </UChip>
        </UButton>
      </UTooltip>
    </template>
  </UDashboardNavbar>
</template>
