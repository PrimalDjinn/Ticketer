<script setup lang="ts">
/** Open public issues, updated live; newly published ones are marked for a while. */
const props = withDefaults(defineProps<{ limit?: number; title?: string }>(), { limit: 5, title: 'Public issues' })

const { data, refresh } = await useFetch<PublicTicketPage>('/api/public/tickets', {
  query: { state: 'active', pageSize: props.limit },
  default: () => ({ items: [], total: 0, page: 1, pageSize: props.limit }),
})
useLivePublicIssues(refresh)

const fresh = ref(new Set<string>())
onRealtime('issue.published', ({ reference }) => {
  fresh.value = new Set([...fresh.value, reference])
  setTimeout(() => {
    const next = new Set(fresh.value)
    next.delete(reference)
    fresh.value = next
  }, 5 * 60_000)
})
</script>

<template>
  <UCard :ui="{ body: 'p-0 sm:p-0' }">
    <template #header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <h2 class="font-semibold text-highlighted">{{ title }}</h2>
          <p class="text-xs text-muted">{{ data.total ? `${data.total} open, visible to everyone` : 'Published issues appear here as they happen' }}</p>
        </div>
        <UButton to="/issues" variant="link" color="neutral" trailing-icon="i-lucide-arrow-right" label="All" size="sm" />
      </div>
    </template>
    <p v-if="!data.items.length" class="px-4 py-6 text-center text-sm text-muted sm:px-6">Nothing reported publicly right now.</p>
    <TransitionGroup v-else tag="ul" name="issue" class="divide-y divide-default">
      <li v-for="issue in data.items" :key="issue.reference">
        <NuxtLink :to="`/issues/${issue.reference}`" class="flex items-center gap-3 px-4 py-2.5 transition hover:bg-elevated/50 sm:px-6">
          <UIcon name="i-lucide-globe" class="size-4 shrink-0" :class="issue.urgency === 'Default' ? 'text-info' : 'text-warning'" />
          <span class="min-w-0 flex-1 truncate text-sm text-default">{{ issue.title }}</span>
          <UBadge v-if="fresh.has(issue.reference)" label="New" color="info" variant="subtle" size="sm" />
          <TicketStatusBadge :status="issue.status" />
        </NuxtLink>
      </li>
    </TransitionGroup>
  </UCard>
</template>

<style scoped>
.issue-enter-active {
  transition: all 0.3s ease;
}
.issue-enter-from {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
