<script setup lang="ts">
import { useDebounceFn } from '@vueuse/core'
/** The team's dashboard: support inbox, tickets waiting for a reply, and tasks assigned to you. */
const { user, staff } = useAccess()
const { items: notifications } = useNotifications()

const { data: stats, refresh: refreshStats } = await useFetch<TicketStats>('/api/tickets/stats', {
  default: () => ({ Open: 0, Pending: 0, Resolved: 0, Closed: 0 }),
})
const { data: recent, refresh: refreshRecent } = await useFetch('/api/tickets', {
  query: { status: 'Open', pageSize: 6 },
  default: () => ({ items: [] as TicketDTO[], total: 0, page: 1, pageSize: 6 }),
})

const { data: mine, refresh: refreshMine } = await useFetch('/api/tasks/mine', {
  default: () => ({ tasks: [] as TaskDTO[], projects: [] as ProjectDTO[], labels: [] as LabelDTO[] }),
})
const mineProjects = computed(() => new Map(mine.value.projects.map((p) => [p.id, p])))
onRealtime('task.updated', () => refreshMine())
onRealtime('task.created', () => refreshMine())

const { stats: inbox, refresh: refreshInbox } = useSupportInbox()
const { data: conversationPage, refresh: refreshConversations } = await useFetch<ConversationPage>('/api/conversations', {
  query: { status: 'open', limit: 5 },
  default: () => ({ items: [], total: 0, page: 1, pageSize: 5 }),
})
const conversations = computed(() => conversationPage.value.items)
const refreshSupport = useDebounceFn(() => Promise.all([refreshInbox(), refreshConversations()]), 500)
onRealtime('conversation.updated', refreshSupport)
onRealtime('conversation.message', refreshSupport)
onRealtime('conversation.read', refreshSupport)

const inboxCards = computed(() => [
  { key: 'unread', label: 'Unread', value: inbox.value.unread, icon: 'i-lucide-message-circle-warning', iconClass: 'text-primary', to: { path: '/conversations', query: { view: 'open' } } },
  { key: 'unassigned', label: 'Unassigned', value: inbox.value.unassigned, icon: 'i-lucide-user-round-x', iconClass: 'text-warning', to: { path: '/conversations', query: { view: 'unassigned' } } },
  { key: 'mine', label: 'Assigned to you', value: inbox.value.mine, icon: 'i-lucide-user-round-check', iconClass: 'text-success', to: { path: '/conversations', query: { view: 'mine' } } },
])

const refresh = () => Promise.all([refreshStats(), refreshRecent(), refreshMine(), refreshSupport()])
onRealtime('ticket.created', refresh)
onRealtime('ticket.updated', refresh)
onRealtime('ticket.deleted', refresh)
onRealtimeResync(refresh)

const cards = computed(() =>
  TICKET_STATUSES.map((status) => ({
    status,
    count: stats.value[status],
    ...statusMeta[status],
    iconClass: { Open: 'text-info', Pending: 'text-warning', Resolved: 'text-success', Closed: 'text-muted' }[status],
    hint: { Open: 'Waiting for a first reply', Pending: 'Being worked on', Resolved: 'Fixed, awaiting confirmation', Closed: 'Done' }[status],
  })),
)

const greeting = computed(() => {
  const hour = new Date().getHours()
  return hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
})

const search = reactive({ q: '', from: '', to: '' })
function runSearch() {
  const query = Object.fromEntries(Object.entries(search).filter(([, v]) => v))
  navigateTo({ path: '/tickets', query })
}
</script>

<template>
  <UDashboardPanel id="dashboard">
    <template #header>
      <AppNavbar title="Dashboard">
        <template #right>
          <UButton v-if="staff" to="/tickets/new" icon="i-lucide-plus" label="New ticket" class="hidden sm:inline-flex" />
        </template>
      </AppNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-8">
        <div>
          <h1 class="text-2xl font-semibold tracking-tight text-highlighted">{{ greeting }}, {{ user?.name }}</h1>
          <p class="mt-1 text-muted">
            <template v-if="notifications.length">You have {{ notifications.length }} unread notification{{ notifications.length === 1 ? '' : 's' }}.</template>
            <template v-else>Nothing needs your attention right now.</template>
          </p>
        </div>

        <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <NuxtLink
            v-for="card in cards"
            :key="card.status"
            :to="{ path: '/tickets', query: { status: card.status } }"
            class="group rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/50"
          >
            <div class="flex items-center justify-between">
              <span class="text-sm font-medium text-muted">{{ card.label }}</span>
              <UIcon :name="card.icon" class="size-5" :class="card.iconClass" />
            </div>
            <p class="mt-3 text-3xl font-semibold tabular-nums text-highlighted">{{ card.count }}</p>
            <p class="mt-1 text-xs text-dimmed">{{ card.hint }}</p>
          </NuxtLink>
        </div>

        <UCard :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="font-semibold text-highlighted">Support inbox</h2>
                <p class="text-xs text-muted">{{ inbox.open }} open conversation{{ inbox.open === 1 ? '' : 's' }} with people outside the team</p>
              </div>
              <UButton to="/conversations" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="Open inbox" size="sm" />
            </div>
          </template>
          <div class="grid grid-cols-3 divide-x divide-default border-b border-default">
            <NuxtLink v-for="card in inboxCards" :key="card.key" :to="card.to" class="flex items-center gap-3 px-4 py-3 transition hover:bg-elevated/50 sm:px-6">
              <UIcon :name="card.icon" class="hidden size-5 shrink-0 sm:block" :class="card.iconClass" />
              <div class="min-w-0">
                <p class="text-xl font-semibold tabular-nums text-highlighted">{{ card.value }}</p>
                <p class="truncate text-xs text-muted">{{ card.label }}</p>
              </div>
            </NuxtLink>
          </div>
          <UEmpty v-if="!conversations.length" variant="naked" icon="i-lucide-messages-square" title="No open conversations" description="Chats from customers and visitors land here." class="py-8" />
          <ul v-else class="divide-y divide-default">
            <li v-for="c in conversations" :key="c.id">
              <NuxtLink :to="{ path: '/conversations', query: { c: c.id } }" class="flex items-center gap-3 px-4 py-2.5 transition hover:bg-elevated/50 sm:px-6">
                <UChip :show="c.unread > 0" color="primary" size="md" inset>
                  <UAvatar :text="initials(c.customer.name)" size="sm" />
                </UChip>
                <div class="min-w-0 flex-1">
                  <p class="flex items-center gap-1.5 text-sm" :class="c.unread ? 'font-semibold text-highlighted' : 'font-medium text-default'">
                    <span class="truncate">{{ c.customer.name }}</span>
                    <UBadge v-if="c.customer.isGuest" label="Guest" color="neutral" variant="subtle" size="sm" />
                  </p>
                  <p class="truncate text-xs text-muted">
                    <template v-if="c.preview">{{ c.preview.fromTeam ? `${c.preview.authorName}: ` : '' }}{{ c.preview.body || 'Sent an attachment' }}</template>
                    <template v-else>{{ c.subject ?? 'New conversation' }}</template>
                  </p>
                </div>
                <div class="flex shrink-0 flex-col items-end gap-1">
                  <NuxtTime v-if="c.lastMessageAt" :datetime="c.lastMessageAt" relative class="text-xs text-dimmed" />
                  <span v-if="c.assigneeName" class="text-xs text-muted">{{ c.assigneeName }}</span>
                  <span v-else class="text-xs text-warning">Unassigned</span>
                </div>
              </NuxtLink>
            </li>
          </ul>
        </UCard>

        <UCard v-if="mine.tasks.length" :ui="{ body: 'p-0 sm:p-0' }">
          <template #header>
            <div class="flex items-center justify-between">
              <h2 class="font-semibold text-highlighted">Assigned to you</h2>
              <UButton to="/my-tasks" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="All my tasks" size="sm" />
            </div>
          </template>
          <ul class="divide-y divide-default">
            <li v-for="t in mine.tasks.slice(0, 5)" :key="t.id">
              <NuxtLink :to="`/projects/${mineProjects.get(t.projectId)?.key}/${t.number}`" class="flex items-center gap-3 px-4 py-2.5 transition hover:bg-elevated/50 sm:px-6">
                <UIcon :name="priorityMeta[t.priority].icon" class="size-4 shrink-0" :class="priorityMeta[t.priority].class" />
                <span class="w-16 shrink-0 font-mono text-xs text-muted">{{ t.ref }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ t.title }}</span>
                <span v-if="t.dueDate" class="text-xs" :class="dueState(t.dueDate) === 'overdue' ? 'text-error' : dueState(t.dueDate) === 'soon' ? 'text-warning' : 'text-muted'">
                  {{ formatDay(t.dueDate) }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </UCard>

        <div class="grid gap-6 lg:grid-cols-5">
          <UCard class="lg:col-span-3" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">Waiting for a reply</h2>
                <UButton :to="{ path: '/tickets', query: { status: 'Open' } }" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="View all" size="sm" />
              </div>
            </template>
            <UEmpty v-if="!recent.items.length" variant="naked" icon="i-lucide-inbox" title="Inbox zero" description="No open tickets right now." class="py-10" />
            <ul v-else class="divide-y divide-default">
              <li v-for="ticket in recent.items" :key="ticket.id">
                <NuxtLink :to="`/tickets/${ticket.id}`" class="flex items-center gap-4 px-4 py-3 transition hover:bg-elevated/50 sm:px-6">
                  <div class="min-w-0 flex-1">
                    <p class="flex items-center gap-1.5 text-sm font-medium text-highlighted">
                      <UIcon v-if="ticket.visibility === 'public'" name="i-lucide-globe" class="size-3.5 shrink-0 text-info" aria-label="Public" />
                      <span class="truncate">{{ ticket.title }}</span>
                    </p>
                    <p class="text-xs text-muted">
                      #{{ shortRef(ticket.reference) }} · {{ ticket.creatorName ?? 'Unknown' }} · <NuxtTime v-if="ticket.createdAt" :datetime="ticket.createdAt" relative :title="formatDateTime(ticket.createdAt)" />
                    </p>
                  </div>
                  <TicketUrgencyBadge v-if="ticket.urgency !== 'Default'" :urgency="ticket.urgency" />
                </NuxtLink>
              </li>
            </ul>
          </UCard>

          <div class="space-y-6 lg:col-span-2">
          <HomePublicIssues />
          <UCard>
            <template #header>
              <h2 class="font-semibold text-highlighted">Find a ticket</h2>
            </template>
            <form class="space-y-4" @submit.prevent="runSearch">
              <UFormField label="Reference, text, name or email">
                <UInput v-model="search.q" icon="i-lucide-search" placeholder="Search…" class="w-full" />
              </UFormField>
              <div class="grid grid-cols-2 gap-3">
                <UFormField label="From">
                  <UInput v-model="search.from" type="date" class="w-full" />
                </UFormField>
                <UFormField label="To">
                  <UInput v-model="search.to" type="date" class="w-full" />
                </UFormField>
              </div>
              <UButton type="submit" block icon="i-lucide-search" label="Search" variant="subtle" />
            </form>
          </UCard>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
