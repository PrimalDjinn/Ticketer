<script setup lang="ts">
import { watchDebounced } from '@vueuse/core'

const props = defineProps<{
  members: PublicUser[]
  labels: LabelDTO[]
  /** Shown on the right, e.g. "12 tasks". */
  count?: number
}>()

const { filters, active, setFilters, clear } = useTaskFilters()

// --- Search: local text, debounced into the URL ---------------------------------------------------------------------
const search = ref(filters.value.q)
watchDebounced(search, (q) => q.trim() !== filters.value.q && setFilters({ q: q.trim() }), { debounce: 250 })
watch(() => filters.value.q, (q) => {
  if (q !== search.value.trim()) search.value = q
})

const input = useTemplateRef<{ inputRef: HTMLInputElement | null }>('input')
defineExpose({ focus: () => input.value?.inputRef?.focus() })

// --- Pickers --------------------------------------------------------------------------------------------------------
const assigneeItems = computed(() => [
  { label: 'Unassigned', value: UNASSIGNED, icon: 'i-lucide-circle-user' },
  ...props.members.map((m) => ({ label: m.name, value: m.id, avatar: { alt: m.name } })),
])
const assignees = computed({
  get: () => filters.value.assignee,
  set: (assignee: string[]) => setFilters({ assignee }),
})

const priorityItems = [...TASK_PRIORITIES].reverse().map((p) => ({
  label: priorityMeta[p].label,
  value: p,
  icon: priorityMeta[p].icon,
  ui: { itemLeadingIcon: priorityMeta[p].class },
}))
const priorities = computed({
  get: () => filters.value.priority,
  set: (priority: TaskPriority[]) => setFilters({ priority }),
})

const labelItems = computed(() => props.labels.map((l) => ({ label: l.name, value: l.id, chip: { ui: { base: color(l.color).dot } } })))
const labelIds = computed({
  get: () => filters.value.label,
  set: (label: number[]) => setFilters({ label }),
})

function summary(selected: unknown[], all: { value: unknown; label: string }[], noun: string) {
  // Only count values that still exist (a shared link may name a deleted label or person).
  const picked = all.filter((item) => selected.includes(item.value))
  if (!picked.length) return noun
  if (picked.length === 1) return picked[0]!.label
  return `${picked.length} ${noun.toLowerCase()}s`
}

function clearAll() {
  search.value = ''
  clear()
}
</script>

<template>
  <div class="flex w-full min-w-0 items-center gap-2 overflow-x-auto py-0.5">
    <UInput
      ref="input"
      v-model="search"
      icon="i-lucide-search"
      placeholder="Search tasks"
      size="sm"
      variant="soft"
      aria-label="Search tasks by title or reference"
      class="w-44 shrink-0 sm:w-56"
      @keydown.esc="($event.target as HTMLInputElement).blur()"
    >
      <template #trailing>
        <UKbd v-if="!search" value="/" class="hidden sm:inline-flex" />
        <UButton v-else icon="i-lucide-x" size="xs" color="neutral" variant="link" aria-label="Clear search" class="-me-1" @click="search = ''" />
      </template>
    </UInput>

    <USelectMenu
      v-model="assignees"
      :items="assigneeItems"
      value-key="value"
      multiple
      size="sm"
      :variant="filters.assignee.length ? 'subtle' : 'ghost'"
      icon="i-lucide-user"
      placeholder="Assignee"
      :search-input="{ placeholder: 'Filter people…' }"
      class="shrink-0"
      aria-label="Filter by assignee"
      :ui="{ content: 'min-w-52' }"
    >
      <span class="truncate">{{ summary(filters.assignee, assigneeItems, 'Assignee') }}</span>
    </USelectMenu>

    <USelectMenu
      v-model="priorities"
      :items="priorityItems"
      value-key="value"
      multiple
      size="sm"
      :variant="filters.priority.length ? 'subtle' : 'ghost'"
      icon="i-lucide-signal"
      :search-input="false"
      class="shrink-0"
      aria-label="Filter by priority"
      :ui="{ content: 'min-w-44' }"
    >
      <span class="truncate">{{ summary(filters.priority, priorityItems, 'Priority') }}</span>
    </USelectMenu>

    <USelectMenu
      v-if="labels.length"
      v-model="labelIds"
      :items="labelItems"
      value-key="value"
      multiple
      size="sm"
      :variant="filters.label.length ? 'subtle' : 'ghost'"
      icon="i-lucide-tag"
      :search-input="{ placeholder: 'Filter labels…' }"
      class="shrink-0"
      aria-label="Filter by label"
      :ui="{ content: 'min-w-48' }"
    >
      <span class="truncate">{{ summary(filters.label, labelItems, 'Label') }}</span>
    </USelectMenu>

    <UButton v-if="active" label="Clear" icon="i-lucide-x" size="sm" color="neutral" variant="ghost" class="shrink-0" @click="clearAll" />

    <span v-if="count !== undefined" class="ms-auto shrink-0 ps-2 text-xs text-muted tabular-nums">{{ count }} task{{ count === 1 ? '' : 's' }}</span>
  </div>
</template>
