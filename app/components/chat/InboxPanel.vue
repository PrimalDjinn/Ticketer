<script setup lang="ts">
/** The team's view of support in the chat popover: open conversations, newest first; each opens the inbox. */
import { useDebounceFn } from '@vueuse/core'

const emit = defineEmits<{ navigate: [] }>()
const { stats } = useSupportInbox()
const items = ref<ConversationDTO[]>([])
const loaded = ref(false)

async function load() {
  const page = await $fetch<ConversationPage>('/api/conversations', { query: { status: 'open', pageSize: 15 } }).catch(() => null)
  items.value = page?.items ?? []
  loaded.value = true
}
load()
const soon = useDebounceFn(load, 300)
onRealtime('conversation.updated', soon)
onRealtime('conversation.message', soon)
onRealtime('conversation.read', soon)
onRealtimeResync(load)

function go(path: string) {
  emit('navigate')
  navigateTo(path)
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="grid grid-cols-3 gap-px border-b border-default bg-default text-center">
      <button type="button" class="px-2 py-2 hover:bg-elevated/60" @click="go('/conversations')">
        <p class="text-base font-semibold text-highlighted tabular-nums">{{ stats.open }}</p>
        <p class="text-[11px] text-muted">Open</p>
      </button>
      <button type="button" class="px-2 py-2 hover:bg-elevated/60" @click="go('/conversations?view=unassigned')">
        <p class="text-base font-semibold text-highlighted tabular-nums">{{ stats.unassigned }}</p>
        <p class="text-[11px] text-muted">Unassigned</p>
      </button>
      <button type="button" class="px-2 py-2 hover:bg-elevated/60" @click="go('/conversations?view=mine')">
        <p class="text-base font-semibold text-highlighted tabular-nums">{{ stats.mine }}</p>
        <p class="text-[11px] text-muted">Mine</p>
      </button>
    </div>
    <div class="flex-1 overflow-y-auto">
      <UEmpty v-if="loaded && !items.length" icon="i-lucide-inbox" title="Inbox zero" description="No open support conversations." class="py-10" />
      <button
        v-for="c in items"
        :key="c.id"
        type="button"
        class="flex w-full items-start gap-3 px-4 py-2.5 text-left transition hover:bg-elevated/60"
        @click="go(`/conversations?c=${c.id}`)"
      >
        <UAvatar :text="initials(c.customer.name)" size="sm" />
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-sm font-medium text-highlighted">{{ c.customer.name }}</p>
            <span class="shrink-0 text-[11px] text-dimmed"><NuxtTime :datetime="c.lastMessageAt ?? c.createdAt" relative /></span>
          </div>
          <p class="truncate text-xs" :class="c.unread ? 'font-medium text-highlighted' : 'text-muted'">{{ c.subject || c.preview?.body || 'No messages yet' }}</p>
          <p class="mt-0.5 truncate text-[11px] text-dimmed">{{ c.assigneeName ? `Assigned to ${c.assigneeName}` : 'Unassigned' }}</p>
        </div>
        <UBadge v-if="c.unread" :label="String(c.unread)" size="sm" class="rounded-full" />
      </button>
    </div>
    <div class="border-t border-default p-2">
      <UButton block color="neutral" variant="outline" icon="i-lucide-inbox" label="Open inbox" @click="go('/conversations')" />
    </div>
  </div>
</template>
