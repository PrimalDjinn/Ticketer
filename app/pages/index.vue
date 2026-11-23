<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Dashboard · Ticketer' })

const { user } = useUserSession()
const { items: notifications } = useNotifications()

const { data: stats, refresh: refreshStats } = await useFetch<TicketStats>('/api/tickets/stats', {
  default: () => ({ Open: 0, Pending: 0, Resolved: 0, Closed: 0 }),
})
const { data: recent, refresh: refreshRecent } = await useFetch('/api/tickets', {
  query: { status: 'Open', pageSize: 6 },
  default: () => ({ items: [] as TicketDTO[], total: 0, page: 1, pageSize: 6 }),
})

const refresh = () => Promise.all([refreshStats(), refreshRecent()])
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
          <UButton to="/tickets/new" icon="i-lucide-plus" label="New ticket" class="hidden sm:inline-flex" />
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

        <div class="grid gap-6 lg:grid-cols-5">
          <UCard class="lg:col-span-3" :ui="{ body: 'p-0 sm:p-0' }">
            <template #header>
              <div class="flex items-center justify-between">
                <h2 class="font-semibold text-highlighted">Waiting for a reply</h2>
                <UButton :to="{ path: '/tickets', query: { status: 'Open' } }" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="View all" size="sm" />
              </div>
            </template>
            <UEmpty v-if="!recent.items.length" icon="i-lucide-inbox" title="Inbox zero" description="No open tickets right now." class="py-10" />
            <ul v-else class="divide-y divide-default">
              <li v-for="ticket in recent.items" :key="ticket.id">
                <NuxtLink :to="`/tickets/${ticket.id}`" class="flex items-center gap-4 px-4 py-3 transition hover:bg-elevated/50 sm:px-6">
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-sm font-medium text-highlighted">{{ ticket.info }}</p>
                    <p class="text-xs text-muted">
                      #{{ shortRef(ticket.reference) }} · {{ ticket.creatorName ?? 'Unknown' }} · <NuxtTime v-if="ticket.createdAt" :datetime="ticket.createdAt" relative :title="formatDateTime(ticket.createdAt)" />
                    </p>
                  </div>
                  <TicketUrgencyBadge v-if="ticket.urgency !== 'Default'" :urgency="ticket.urgency" />
                </NuxtLink>
              </li>
            </ul>
          </UCard>

          <UCard class="lg:col-span-2">
            <template #header>
              <h2 class="font-semibold text-highlighted">Find a ticket</h2>
            </template>
            <form class="space-y-4" @submit.prevent="runSearch">
              <UFormField :label="user?.isAdmin ? 'Reference, text, name or email' : 'Reference or text'">
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
    </template>
  </UDashboardPanel>
</template>
