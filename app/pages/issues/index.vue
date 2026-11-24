<script setup lang="ts">
import { z } from 'zod'
import { useDocumentVisibility, useIntervalFn, watchDebounced } from '@vueuse/core'

definePageMeta({ layout: 'public' })

const appName = useRuntimeConfig().public.appName || 'Ticketer'
const route = useRoute()
const router = useRouter()

const filtersSchema = z.object({
  q: z.string().max(100).optional().catch(undefined),
  status: z.enum(TICKET_STATUSES).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(500).catch(1).default(1),
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
watchDebounced(searchText, (q) => setFilters({ q: q.trim() || undefined }), { debounce: 350 })

const { data: overview } = await usePublicOverview()
const pageSize = 20
const { data, status, refresh } = await useFetch<PublicTicketPage>('/api/public/tickets', {
  query: computed(() => ({ ...filters.value, pageSize })),
  default: () => ({ items: [], total: 0, page: 1, pageSize }),
})

// Keep the list fresh while someone is looking at it.
const visibility = useDocumentVisibility()
useIntervalFn(() => visibility.value === 'visible' && refresh(), 30_000)

useSeoMeta({
  title: () => `Issues · ${appName}`,
  description: `Known issues, announcements and their status from the ${appName} team.`,
  ogTitle: () => `Issues · ${appName}`,
  ogDescription: `Known issues, announcements and their status from the ${appName} team.`,
  ogType: 'website',
})

const chips = computed(() => [
  { label: 'All', value: undefined, icon: 'i-lucide-list' },
  ...TICKET_STATUSES.map((s) => ({ label: statusMeta[s].label, value: s, icon: statusMeta[s].icon })),
])
const statusText: Record<TicketStatus, string> = { Open: 'text-info', Pending: 'text-warning', Resolved: 'text-success', Closed: 'text-muted' }
</script>

<template>
  <div class="mx-auto w-full max-w-5xl px-4 py-8 sm:py-12">
    <div class="mb-8 space-y-2">
      <h1 class="text-2xl font-semibold tracking-tight text-highlighted sm:text-3xl">Status and known issues</h1>
      <p class="max-w-2xl text-muted">Known issues, fixes in progress and announcements from the team. Sign in to follow an issue or add details.</p>
    </div>
    <PublicStatusBanner :status="overview.status" class="mb-8" />

    <div class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
      <UInput v-model="searchText" icon="i-lucide-search" placeholder="Search issues…" class="w-full sm:w-80" size="lg" aria-label="Search issues" />
      <div class="flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        <UButton
          v-for="chip in chips"
          :key="chip.label"
          :label="chip.label"
          :icon="chip.icon"
          size="sm"
          :color="filters.status === chip.value ? 'primary' : 'neutral'"
          :variant="filters.status === chip.value ? 'soft' : 'ghost'"
          :aria-pressed="filters.status === chip.value"
          @click="setFilters({ status: chip.value })"
        />
      </div>
    </div>

    <p class="mb-2 text-sm text-muted">{{ data.total }} issue{{ data.total === 1 ? '' : 's' }}</p>

    <ul v-if="data.items.length" class="divide-y divide-default overflow-hidden rounded-xl bg-default ring ring-default">
      <li v-for="issue in data.items" :key="issue.id">
        <NuxtLink :to="`/issues/${issue.reference}`" class="flex items-start gap-3 px-4 py-4 transition hover:bg-elevated/50">
          <UIcon :name="statusMeta[issue.status].icon" class="mt-0.5 size-5 shrink-0" :class="statusText[issue.status]" />
          <div class="min-w-0 flex-1">
            <p class="font-medium break-words text-highlighted">{{ issue.title }}</p>
            <p v-if="issue.excerpt && issue.excerpt !== issue.title" class="mt-0.5 line-clamp-1 text-sm text-muted">{{ issue.excerpt }}</p>
            <p class="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <TicketStatusBadge :status="issue.status" size="sm" />
              <span class="font-mono">#{{ shortRef(issue.reference) }}</span>
              <span>Updated <NuxtTime :datetime="issue.lastActivityAt" relative /></span>
              <span class="flex items-center gap-1">
                <UIcon name="i-lucide-message-square" class="size-3.5" />
                {{ issue.replyCount }}<span class="sr-only"> replies</span>
              </span>
            </p>
          </div>
        </NuxtLink>
      </li>
    </ul>
    <UEmpty
      v-else-if="status !== 'pending'"
      icon="i-lucide-circle-check-big"
      :title="filters.q || filters.status ? 'No issues match' : 'No public issues'"
      :description="filters.q || filters.status ? 'Try a different search or status.' : 'Nothing has been reported publicly. Everything is running smoothly.'"
      :actions="[{ label: 'Report an issue', to: '/tickets/new', icon: 'i-lucide-square-pen', variant: 'outline', color: 'neutral' }]"
      class="rounded-xl ring ring-default"
    />

    <div v-if="data.total > pageSize" class="mt-6 flex justify-center">
      <UPagination :page="filters.page" :total="data.total" :items-per-page="pageSize" @update:page="(p) => setFilters({ ...filters, page: p })" />
    </div>
  </div>
</template>
