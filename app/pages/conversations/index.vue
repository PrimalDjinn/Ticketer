<script setup lang="ts">
import { z } from 'zod'
import { useDebounceFn, watchDebounced } from '@vueuse/core'

/**
 * The support inbox: every conversation people outside the team started. Any admin or member can reply, assign,
 * close and turn one into a ticket; viewers read along. The selected conversation lives in the URL (`?c=<id>`).
 */
definePageMeta({ middleware: ['auth', 'internal'] })
useSeoMeta({ title: 'Conversations · Ticketer' })

const route = useRoute()
const router = useRouter()

const VIEWS = ['open', 'mine', 'unassigned', 'closed', 'all'] as const
type View = (typeof VIEWS)[number]
const filtersSchema = z.object({
  view: z.enum(VIEWS).catch('open').default('open'),
  q: z.string().trim().max(200).optional().catch(undefined),
  c: z.coerce.number().int().positive().optional().catch(undefined),
})
const filters = computed(() => filtersSchema.parse(route.query))
const selectedId = computed(() => filters.value.c ?? null)

function setQuery(patch: Partial<{ view: View; q: string | undefined; c: number | null }>) {
  const next = { ...filters.value, ...patch }
  const query: Record<string, string> = {}
  if (next.view !== 'open') query.view = next.view
  if (next.q) query.q = next.q
  if (next.c) query.c = String(next.c)
  router.replace({ query })
}

const searchText = ref(filters.value.q ?? '')
watchDebounced(searchText, (q) => setQuery({ q: q.trim() || undefined }), { debounce: 300 })

const pageSize = ref(50)
const apiQuery = computed(() => {
  const view = filters.value.view
  return {
    status: view === 'closed' ? 'closed' : view === 'all' ? 'all' : 'open',
    assignee: view === 'mine' ? 'me' : view === 'unassigned' ? 'none' : undefined,
    q: filters.value.q || undefined,
    pageSize: pageSize.value,
  }
})
const { data, status, refresh } = await useFetch<ConversationPage>('/api/conversations', {
  query: apiQuery,
  default: () => ({ items: [], total: 0, page: 1, pageSize: 50 }),
  deep: true,
})
const { data: staff } = await useFetch<PublicUser[]>('/api/members', { default: () => [] })
const { stats, refresh: refreshStats } = useSupportInbox()
onMounted(refreshStats)

const refreshSoon = useDebounceFn(() => refresh(), 400)
onRealtime('conversation.updated', (conversation) => {
  const item = data.value.items.find((c) => c.id === conversation.id)
  if (item) Object.assign(item, { ...conversation, unread: item.unread })
  refreshSoon()
})
onRealtime('conversation.message', refreshSoon)
onRealtime('conversation.read', refreshSoon)
onRealtimeResync(() => refresh())

/** The detail pane changed something (assignment, status, read, ticket): reflect it without waiting for the server. */
function onChanged(conversation: ConversationDTO) {
  const item = data.value.items.find((c) => c.id === conversation.id)
  if (item) Object.assign(item, conversation)
  refreshStats()
  refreshSoon()
}

const tabs = computed(() => [
  { label: 'Open', value: 'open', badge: stats.value.open ? String(stats.value.open) : undefined },
  { label: 'Mine', value: 'mine', badge: stats.value.mine ? String(stats.value.mine) : undefined },
  { label: 'Unassigned', value: 'unassigned', badge: stats.value.unassigned ? String(stats.value.unassigned) : undefined },
  { label: 'Closed', value: 'closed' },
])
const activeTab = computed({
  get: () => filters.value.view,
  set: (value: string) => setQuery({ view: VIEWS.find((v) => v === value) ?? 'open' }),
})

const emptyText = computed(() => {
  if (filters.value.q) return { title: 'No matches', description: 'Try a name, email, subject or words from a message.' }
  switch (filters.value.view) {
    case 'mine':
      return { title: 'Nothing assigned to you', description: 'Pick up a conversation from Unassigned.' }
    case 'unassigned':
      return { title: 'Everything is assigned', description: 'Every open conversation has an owner.' }
    case 'closed':
      return { title: 'No closed conversations', description: 'Closed conversations show up here.' }
    default:
      return { title: 'Inbox zero', description: 'When someone outside the team starts a chat, it lands here.' }
  }
})
</script>

<template>
  <UDashboardPanel id="conversations" :ui="{ body: 'flex-row gap-0 sm:gap-0 p-0 sm:p-0 overflow-hidden' }">
    <template #header>
      <AppNavbar title="Conversations" />
    </template>

    <template #body>
      <!-- List -->
      <aside class="min-h-0 w-full flex-col border-default lg:flex lg:w-96 lg:shrink-0 lg:border-e" :class="selectedId ? 'hidden' : 'flex'" aria-label="Conversations">
        <div class="space-y-2 border-b border-default p-3">
          <UTabs v-model="activeTab" :items="tabs" :content="false" size="xs" variant="link" class="w-full" />
          <UInput v-model="searchText" icon="i-lucide-search" placeholder="Search name, email, subject, message…" size="sm" class="w-full" aria-label="Search conversations">
            <template v-if="searchText" #trailing>
              <UButton icon="i-lucide-x" color="neutral" variant="link" size="xs" aria-label="Clear search" @click="searchText = ''" />
            </template>
          </UInput>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto">
          <UEmpty v-if="status !== 'pending' && !data.items.length" icon="i-lucide-inbox" :title="emptyText.title" :description="emptyText.description" class="py-14" />
          <ConversationListItem v-for="c in data.items" :key="c.id" :conversation="c" :selected="c.id === selectedId" />
          <div v-if="data.total > data.items.length" class="p-3">
            <UButton block color="neutral" variant="ghost" label="Load more" :loading="status === 'pending'" @click="pageSize += 50" />
          </div>
        </div>
      </aside>

      <!-- Thread -->
      <section class="min-h-0 min-w-0 flex-1 flex-col lg:flex" :class="selectedId ? 'flex' : 'hidden'" aria-label="Conversation">
        <ConversationDetail v-if="selectedId" :id="selectedId" :staff="staff" @back="setQuery({ c: null })" @changed="onChanged" />
        <div v-else class="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <UIcon name="i-lucide-messages-square" class="size-10 text-dimmed" />
          <p class="font-medium text-highlighted">Pick a conversation</p>
          <p class="max-w-xs text-sm text-muted">Reply to people outside the team, assign conversations, and turn them into tickets.</p>
        </div>
      </section>
    </template>
  </UDashboardPanel>
</template>
