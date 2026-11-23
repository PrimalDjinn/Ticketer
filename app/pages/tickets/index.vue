<script setup lang="ts">
import { z } from 'zod'
import { watchDebounced } from '@vueuse/core'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Tickets · Ticketer' })

const { user } = useUserSession()
const route = useRoute()
const router = useRouter()
const toast = useToast()

// URL is the source of truth for filters, so every view is linkable.
const filtersSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  page: z.coerce.number().int().min(1).catch(1).default(1),
})
const filters = computed(() => filtersSchema.parse(route.query))

function setFilters(patch: Partial<z.input<typeof filtersSchema>>) {
  const next = { ...filters.value, page: 1, ...patch }
  const query: Record<string, string> = {}
  for (const [key, value] of Object.entries(next)) {
    if (value === undefined || value === '' || (key === 'page' && value === 1)) continue
    query[key] = String(value)
  }
  router.replace({ query })
}

const searchText = ref(filters.value.q ?? '')
watchDebounced(searchText, (q) => setFilters({ q: q || undefined }), { debounce: 350 })

const pageSize = 20
const { data, status, refresh } = await useFetch('/api/tickets', {
  query: computed(() => ({ ...filters.value, pageSize })),
  default: () => ({ items: [] as TicketDTO[], total: 0, page: 1, pageSize }),
  deep: true, // rows are patched in place by realtime updates and status actions
})

onRealtime('ticket.created', () => refresh())
onRealtime('ticket.deleted', () => refresh())
onRealtime('ticket.updated', (ticket) => {
  const index = data.value.items.findIndex((t) => t.id === ticket.id)
  if (index === -1) return
  if (filters.value.status && ticket.status !== filters.value.status) refresh()
  else data.value.items.splice(index, 1, { ...data.value.items[index], ...ticket, creatorName: ticket.creatorName ?? data.value.items[index]!.creatorName })
})
onRealtimeResync(() => refresh())

const tabs = computed(() => [
  { label: 'All', value: 'all' },
  ...TICKET_STATUSES.map((s) => ({ label: statusMeta[s].label, value: s, icon: statusMeta[s].icon })),
])
const activeTab = computed({
  get: () => filters.value.status ?? 'all',
  set: (value: string) => setFilters({ status: value === 'all' ? undefined : (value as TicketStatus) }),
})

async function setStatus(ticket: TicketDTO, status: TicketStatus) {
  try {
    const updated = await $fetch<TicketDTO>(`/api/tickets/${ticket.id}`, { method: 'PATCH', body: { status } })
    Object.assign(ticket, updated, { creatorName: ticket.creatorName })
    toast.add({ title: `Ticket marked ${status.toLowerCase()}`, color: 'success', icon: statusMeta[status].icon })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}

// Secondary columns step aside on phones; the issue and status stay.
const desktopOnly = { class: { th: 'hidden md:table-cell', td: 'hidden md:table-cell' } }
const columns = computed<TableColumn<TicketDTO>[]>(() => [
  { accessorKey: 'info', header: 'Issue' },
  ...(user.value?.isAdmin ? [{ accessorKey: 'creatorName', header: 'From', meta: desktopOnly } as TableColumn<TicketDTO>] : []),
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'urgency', header: 'Urgency', meta: desktopOnly },
  { accessorKey: 'createdAt', header: 'Opened', meta: desktopOnly },
  ...(user.value?.isAdmin ? [{ id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') } as TableColumn<TicketDTO>] : []),
])

function actionsFor(ticket: TicketDTO) {
  return TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => ({
    label: `Mark ${statusMeta[s].label.toLowerCase()}`,
    icon: statusMeta[s].icon,
    onSelect: () => setStatus(ticket, s),
  }))
}

const hasFilters = computed(() => !!(filters.value.q || filters.value.from || filters.value.to))
</script>

<template>
  <UDashboardPanel id="tickets">
    <template #header>
      <AppNavbar :title="user?.isAdmin ? 'All tickets' : 'My tickets'">
        <template #right>
          <UButton to="/tickets/new" icon="i-lucide-plus" label="New ticket" class="hidden sm:inline-flex" />
        </template>
      </AppNavbar>
      <UDashboardToolbar>
        <template #left>
          <UTabs v-model="activeTab" :items="tabs" :content="false" size="sm" variant="link" class="-mb-px" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-end gap-3">
        <UInput v-model="searchText" icon="i-lucide-search" placeholder="Search tickets…" class="w-full sm:w-72" />
        <UInput :model-value="filters.from" type="date" aria-label="From date" @update:model-value="(v) => setFilters({ from: String(v) || undefined })" />
        <UInput :model-value="filters.to" type="date" aria-label="To date" @update:model-value="(v) => setFilters({ to: String(v) || undefined })" />
        <UButton v-if="hasFilters" variant="ghost" color="neutral" icon="i-lucide-x" label="Clear" @click="searchText = ''; setFilters({ q: undefined, from: undefined, to: undefined })" />
        <span class="ml-auto text-sm text-muted">{{ data.total }} ticket{{ data.total === 1 ? '' : 's' }}</span>
      </div>

      <UTable
        :data="data.items"
        :columns="columns"
        :loading="status === 'pending'"
        class="flex-1"
        :ui="{ tr: 'cursor-pointer', td: 'py-3' }"
        @select="(_e, row) => navigateTo(`/tickets/${row.original.id}`)"
      >
        <template #info-cell="{ row }">
          <div class="max-w-[60vw] min-w-0 md:max-w-md md:min-w-48">
            <p class="truncate font-medium text-highlighted">{{ row.original.info }}</p>
            <p class="text-xs text-muted">
              #{{ shortRef(row.original.reference) }}<span class="md:hidden"> · <NuxtTime v-if="row.original.createdAt" :datetime="row.original.createdAt" relative /></span>
            </p>
          </div>
        </template>
        <template #creatorName-cell="{ row }">
          <span class="text-sm">{{ row.original.creatorName ?? '—' }}</span>
        </template>
        <template #status-cell="{ row }">
          <TicketStatusBadge :status="row.original.status" />
        </template>
        <template #urgency-cell="{ row }">
          <TicketUrgencyBadge :urgency="row.original.urgency" />
        </template>
        <template #createdAt-cell="{ row }">
          <NuxtTime v-if="row.original.createdAt" :datetime="row.original.createdAt" relative :title="formatDateTime(row.original.createdAt)" class="text-sm whitespace-nowrap text-muted" />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end" @click.stop>
            <UDropdownMenu :items="actionsFor(row.original)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" aria-label="Ticket actions" />
            </UDropdownMenu>
          </div>
        </template>
        <template #empty>
          <UEmpty
            icon="i-lucide-ticket-x"
            :title="hasFilters ? 'No tickets match' : 'No tickets yet'"
            :description="hasFilters ? 'Try a different search or date range.' : 'Tickets you open will show up here.'"
            :actions="hasFilters ? [] : [{ label: 'Open a ticket', to: '/tickets/new', icon: 'i-lucide-plus' }]"
          />
        </template>
      </UTable>

      <div v-if="data.total > pageSize" class="flex justify-center border-t border-default pt-4">
        <UPagination :page="filters.page" :total="data.total" :items-per-page="pageSize" @update:page="(p) => setFilters({ ...filters, page: p })" />
      </div>
    </template>
  </UDashboardPanel>
</template>
