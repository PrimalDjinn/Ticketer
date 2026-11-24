<script setup lang="ts">
import { z } from 'zod'
import { watchDebounced } from '@vueuse/core'
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ middleware: 'auth' })

const { user, internal, staff } = useAccess()
const route = useRoute()
const router = useRouter()
const toast = useToast()

useSeoMeta({ title: () => (internal.value ? 'Tickets' : 'My tickets') })

// URL is the source of truth for filters, so every view is linkable.
const filtersSchema = z.object({
  status: z.enum(TICKET_STATUSES).optional().catch(undefined),
  q: z.string().optional().catch(undefined),
  from: z.string().optional().catch(undefined),
  to: z.string().optional().catch(undefined),
  /** Team: me, none, or a user id. */
  assignee: z.string().max(64).optional().catch(undefined),
  /** Team: public or private only. */
  visibility: z.enum(TICKET_VISIBILITIES).optional().catch(undefined),
  /** Outside the team: own tickets or public issues. */
  scope: z.enum(['mine', 'public']).optional().catch(undefined),
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
  const current = data.value.items[index]!
  const filteredOut =
    (filters.value.status && ticket.status !== filters.value.status) || (filters.value.visibility && ticket.visibility !== filters.value.visibility)
  if (filteredOut) refresh()
  else data.value.items.splice(index, 1, { ...current, ...ticket, creatorId: ticket.creatorId ?? current.creatorId, creatorName: ticket.creatorName ?? current.creatorName })
})
onRealtimeResync(() => refresh())

const tabs = computed(() => [
  { label: 'All', value: 'all' },
  ...TICKET_STATUSES.map((s) => ({ label: statusMeta[s].label, value: s, icon: statusMeta[s].icon })),
])
const activeTab = computed({
  get: () => filters.value.status ?? 'all',
  set: (value: string) => setFilters({ status: TICKET_STATUSES.find((s) => s === value) }),
})

// People outside the team switch between their own tickets and public issues.
const scopeTabs = [
  { label: 'My tickets', value: 'mine', icon: 'i-lucide-inbox' },
  { label: 'Public issues', value: 'public', icon: 'i-lucide-globe' },
]
const scope = computed({
  get: () => filters.value.scope ?? 'mine',
  set: (value: string) => setFilters({ scope: value === 'public' ? 'public' : undefined, status: undefined }),
})

async function patchTicket(ticket: TicketDTO, body: Record<string, unknown>, message: (t: TicketDTO) => string, icon: string) {
  try {
    const updated = await $fetch<TicketDTO>(`/api/tickets/${ticket.id}`, { method: 'PATCH', body })
    Object.assign(ticket, updated, { creatorName: updated.creatorName ?? ticket.creatorName })
    toast.add({ title: message(updated), color: 'success', icon })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
const setStatus = (ticket: TicketDTO, s: TicketStatus) => patchTicket(ticket, { status: s }, () => `Ticket marked ${s.toLowerCase()}`, statusMeta[s].icon)
const assign = (ticket: TicketDTO, assigneeId: string | null) =>
  patchTicket(ticket, { assigneeId }, (t) => (assigneeId ? `Assigned to ${t.assigneeName}` : 'Unassigned'), 'i-lucide-user-check')

// Support → engineering hand-off, same as on the ticket page.
const { active: projects } = useProjects()
const handingOff = ref<number | null>(null)
async function createTaskFrom(ticket: TicketDTO, projectKey: string) {
  handingOff.value = ticket.id
  try {
    const task = await $fetch<TaskDTO & { projectKey: string }>(`/api/tickets/${ticket.id}/task`, { method: 'POST', body: { projectKey } })
    toast.add({
      title: `Created ${task.ref}`,
      description: ticket.title,
      icon: 'i-lucide-circle-check',
      color: 'success',
      actions: [{ label: 'Open', to: `/projects/${projectKey}/${task.number}`, variant: 'outline' }],
    })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not create the task'), color: 'error' })
  } finally {
    handingOff.value = null
  }
}
const projectItems = (ticket: TicketDTO) => [
  [{ type: 'label' as const, label: 'Create task in…' }],
  projects.value.map((p) => ({ label: p.name, suffix: p.key, icon: 'i-lucide-folder-kanban', onSelect: () => createTaskFrom(ticket, p.key) })),
]

function actionsFor(ticket: TicketDTO) {
  return [
    TICKET_STATUSES.filter((s) => s !== ticket.status).map((s) => ({
      label: `Mark ${statusMeta[s].label.toLowerCase()}`,
      icon: statusMeta[s].icon,
      onSelect: () => setStatus(ticket, s),
    })),
    [
      ticket.assigneeId === user.value?.id
        ? { label: 'Unassign', icon: 'i-lucide-user-x', onSelect: () => assign(ticket, null) }
        : { label: 'Assign to me', icon: 'i-lucide-user-check', onSelect: () => assign(ticket, user.value!.id) },
    ],
    [
      ticket.visibility === 'public'
        ? { label: 'Make private', icon: 'i-lucide-lock', onSelect: () => patchTicket(ticket, { visibility: 'private' }, () => 'Made private', 'i-lucide-lock') }
        : { label: 'Make public…', icon: 'i-lucide-globe', onSelect: () => navigateTo(`/tickets/${ticket.id}`) },
    ],
    ...(projects.value.length
      ? [[{ label: 'Create task in…', icon: 'i-lucide-folder-input', children: projectItems(ticket).slice(1) }]]
      : []),
  ]
}

// Secondary columns step aside on phones; the issue and status stay.
const desktopOnly = { class: { th: 'hidden md:table-cell', td: 'hidden md:table-cell' } }
const wideOnly = { class: { th: 'hidden xl:table-cell', td: 'hidden xl:table-cell' } }
const columns = computed<TableColumn<TicketDTO>[]>(() => [
  { accessorKey: 'title', header: 'Ticket' },
  { accessorKey: 'creatorName', header: 'Reporter', meta: desktopOnly },
  { accessorKey: 'assigneeName', header: 'Assignee', meta: wideOnly },
  { accessorKey: 'status', header: 'Status' },
  { accessorKey: 'urgency', header: 'Urgency', meta: wideOnly },
  { accessorKey: 'updatedAt', header: 'Updated', meta: desktopOnly },
  ...(staff.value ? [{ id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') } as TableColumn<TicketDTO>] : []),
])

const assigneeFilterItems = [
  { label: 'Anyone', value: 'all', icon: 'i-lucide-users' },
  { label: 'Assigned to me', value: 'me', icon: 'i-lucide-user-check' },
  { label: 'Unassigned', value: 'none', icon: 'i-lucide-user-x' },
]
const assigneeFilter = computed({
  get: () => filters.value.assignee ?? 'all',
  set: (value: string) => setFilters({ assignee: value === 'all' ? undefined : value }),
})
const visibilityItems = [
  { label: 'Public and private', value: 'all', icon: 'i-lucide-layers' },
  { label: 'Public', value: 'public', icon: 'i-lucide-globe' },
  { label: 'Private', value: 'private', icon: 'i-lucide-lock' },
]
const visibilityFilter = computed({
  get: () => filters.value.visibility ?? 'all',
  set: (value: string) => setFilters({ visibility: TICKET_VISIBILITIES.find((v) => v === value) }),
})

const hasFilters = computed(() => !!(filters.value.q || filters.value.from || filters.value.to || filters.value.assignee || filters.value.visibility))
function clearFilters() {
  searchText.value = ''
  setFilters({ q: undefined, from: undefined, to: undefined, assignee: undefined, visibility: undefined })
}

const statusText: Record<TicketStatus, string> = { Open: 'text-info', Pending: 'text-warning', Resolved: 'text-success', Closed: 'text-muted' }

const emptyText = computed(() => {
  if (hasFilters.value || filters.value.status) return { title: 'No tickets match', description: 'Try a different search or filter.' }
  if (!internal.value && scope.value === 'public') return { title: 'No public issues', description: 'Known issues and announcements from the team appear here.' }
  return { title: 'No tickets yet', description: 'Tickets you open will show up here.' }
})
</script>

<template>
  <UDashboardPanel id="tickets">
    <template #header>
      <AppNavbar title="Tickets">
        <template #right>
          <UButton to="/tickets/new" icon="i-lucide-plus" label="New ticket" class="hidden sm:inline-flex" />
        </template>
      </AppNavbar>
      <UDashboardToolbar>
        <template #left>
          <UTabs v-if="!internal" v-model="scope" :items="scopeTabs" :content="false" size="sm" variant="link" class="-mb-px" />
          <UTabs v-else v-model="activeTab" :items="tabs" :content="false" size="sm" variant="link" class="-mb-px" />
        </template>
      </UDashboardToolbar>
    </template>

    <template #body>
      <div class="flex flex-wrap items-end gap-3">
        <UInput v-model="searchText" icon="i-lucide-search" :placeholder="internal ? 'Search title, text, reference, reporter…' : 'Search tickets…'" class="w-full sm:w-64" aria-label="Search tickets" />
        <template v-if="internal">
          <USelect v-model="assigneeFilter" :items="assigneeFilterItems" icon="i-lucide-user" class="w-44" aria-label="Filter by assignee" />
          <USelect v-model="visibilityFilter" :items="visibilityItems" class="w-44" aria-label="Filter by visibility" />
          <UInput :model-value="filters.from" type="date" aria-label="From date" class="hidden xl:block" @update:model-value="(v) => setFilters({ from: String(v) || undefined })" />
          <UInput :model-value="filters.to" type="date" aria-label="To date" class="hidden xl:block" @update:model-value="(v) => setFilters({ to: String(v) || undefined })" />
        </template>
        <USelect
          v-else
          :model-value="filters.status ?? 'all'"
          :items="[{ label: 'Any status', value: 'all' }, ...TICKET_STATUSES.map((s) => ({ label: statusMeta[s].label, value: s }))]"
          class="w-40"
          aria-label="Filter by status"
          @update:model-value="(v) => setFilters({ status: TICKET_STATUSES.find((s) => s === v) })"
        />
        <UButton v-if="hasFilters" variant="ghost" color="neutral" icon="i-lucide-x" label="Clear" @click="clearFilters" />
        <span class="ml-auto text-sm text-muted">{{ data.total }} ticket{{ data.total === 1 ? '' : 's' }}</span>
      </div>

      <!-- Team: a dense table -->
      <UTable
        v-if="internal"
        :data="data.items"
        :columns="columns"
        :loading="status === 'pending'"
        class="flex-1"
        :ui="{ tr: 'cursor-pointer', td: 'py-3' }"
        @select="(_e, row) => navigateTo(`/tickets/${row.original.id}`)"
      >
        <template #title-cell="{ row }">
          <div class="max-w-[55vw] min-w-0 md:max-w-md md:min-w-48">
            <p class="flex items-center gap-1.5 font-medium text-highlighted">
              <UTooltip v-if="row.original.visibility === 'public'" text="Public">
                <UIcon name="i-lucide-globe" class="size-4 shrink-0 text-info" aria-label="Public" />
              </UTooltip>
              <span class="truncate">{{ row.original.title }}</span>
            </p>
            <p class="text-xs text-muted">
              #{{ shortRef(row.original.reference) }}<span class="md:hidden"> · <NuxtTime :datetime="row.original.updatedAt ?? row.original.createdAt" relative /></span>
            </p>
          </div>
        </template>
        <template #creatorName-cell="{ row }">
          <span class="text-sm">{{ row.original.creatorName ?? '—' }}</span>
        </template>
        <template #assigneeName-cell="{ row }">
          <span v-if="row.original.assigneeName" class="flex items-center gap-2 text-sm">
            <UAvatar :text="initials(row.original.assigneeName)" size="2xs" />
            {{ row.original.assigneeName }}
          </span>
          <span v-else class="text-sm text-dimmed">—</span>
        </template>
        <template #status-cell="{ row }">
          <TicketStatusBadge :status="row.original.status" />
        </template>
        <template #urgency-cell="{ row }">
          <TicketUrgencyBadge :urgency="row.original.urgency" />
        </template>
        <template #updatedAt-cell="{ row }">
          <NuxtTime
            :datetime="row.original.updatedAt ?? row.original.createdAt"
            relative
            :title="formatDateTime(row.original.updatedAt ?? row.original.createdAt)"
            class="text-sm whitespace-nowrap text-muted"
          />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end gap-0.5" @click.stop>
            <UDropdownMenu v-if="projects.length" :items="projectItems(row.original)" :content="{ align: 'end' }">
              <UTooltip text="Create task in…">
                <UButton
                  icon="i-lucide-folder-input"
                  color="neutral"
                  variant="ghost"
                  :loading="handingOff === row.original.id"
                  :aria-label="`Create a task from ${row.original.title}`"
                />
              </UTooltip>
            </UDropdownMenu>
            <UDropdownMenu :items="actionsFor(row.original)" :content="{ align: 'end' }">
              <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" aria-label="Ticket actions" />
            </UDropdownMenu>
          </div>
        </template>
        <template #empty>
          <UEmpty
            icon="i-lucide-ticket-x"
            :title="emptyText.title"
            :description="emptyText.description"
            :actions="hasFilters ? [] : [{ label: 'Open a ticket', to: '/tickets/new', icon: 'i-lucide-plus' }]"
          />
        </template>
      </UTable>

      <!-- Outside the team: a simple list -->
      <template v-else>
        <ul v-if="data.items.length" class="divide-y divide-default overflow-hidden rounded-lg ring ring-default">
          <li v-for="t in data.items" :key="t.id">
            <NuxtLink :to="`/tickets/${t.id}`" class="flex items-start gap-3 px-4 py-3 transition hover:bg-elevated/50">
              <UIcon :name="statusMeta[t.status].icon" class="mt-0.5 size-5 shrink-0" :class="statusText[t.status]" />
              <div class="min-w-0 flex-1">
                <p class="flex items-center gap-1.5 font-medium text-highlighted">
                  <span class="truncate">{{ t.title }}</span>
                  <UIcon v-if="t.visibility === 'public' && scope === 'mine'" name="i-lucide-globe" class="size-4 shrink-0 text-info" aria-label="Public" />
                </p>
                <p class="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
                  <span class="font-mono">#{{ shortRef(t.reference) }}</span>
                  <span>·</span>
                  <span>Updated <NuxtTime :datetime="t.updatedAt ?? t.createdAt" relative /></span>
                  <template v-if="t.assigneeName">
                    <span>·</span>
                    <span>Handled by {{ t.assigneeName }}</span>
                  </template>
                </p>
              </div>
              <TicketStatusBadge :status="t.status" size="sm" class="shrink-0" />
            </NuxtLink>
          </li>
        </ul>
        <UEmpty
          v-else-if="status !== 'pending'"
          icon="i-lucide-ticket-x"
          :title="emptyText.title"
          :description="emptyText.description"
          :actions="scope === 'mine' && !hasFilters ? [{ label: 'Open a ticket', to: '/tickets/new', icon: 'i-lucide-plus' }] : []"
        />
        <p v-if="scope === 'public'" class="text-center text-xs text-muted">
          Also on the <NuxtLink to="/issues" class="text-primary hover:underline">public issues page</NuxtLink>, which anyone can open without an account.
        </p>
      </template>

      <div v-if="data.total > pageSize" class="flex justify-center border-t border-default pt-4">
        <UPagination :page="filters.page" :total="data.total" :items-per-page="pageSize" @update:page="(p) => setFilters({ ...filters, page: p })" />
      </div>
    </template>
  </UDashboardPanel>
</template>
