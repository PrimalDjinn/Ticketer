<script setup lang="ts">
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'My tasks · Ticketer' })

const { user } = useUserSession()
const { data, refresh } = await useFetch('/api/tasks/mine', {
  default: () => ({ tasks: [] as TaskDTO[], projects: [] as ProjectDTO[], labels: [] as LabelDTO[] }),
})
onRealtime('task.created', (t) => t.assigneeId === user.value?.id && refresh())
onRealtime('task.updated', () => refresh())
onRealtime('task.deleted', ({ id }) => data.value.tasks.some((t) => t.id === id) && refresh())
onRealtimeResync(refresh)

const projectById = computed(() => new Map(data.value.projects.map((p) => [p.id, p])))
const labelById = computed(() => new Map(data.value.labels.map((l) => [l.id, l])))
const statusOf = (t: TaskDTO) => projectById.value.get(t.projectId)?.statuses.find((s) => s.id === t.statusId)

/** Kaneo-style buckets by due date. */
const groups = computed(() => {
  const buckets: Record<string, { label: string; icon: string; tasks: TaskDTO[] }> = {
    overdue: { label: 'Overdue', icon: 'i-lucide-alarm-clock-off', tasks: [] },
    soon: { label: 'Due soon', icon: 'i-lucide-alarm-clock', tasks: [] },
    later: { label: 'Later', icon: 'i-lucide-calendar', tasks: [] },
    none: { label: 'No due date', icon: 'i-lucide-calendar-off', tasks: [] },
  }
  for (const t of data.value.tasks) buckets[dueState(t.dueDate) ?? 'none']!.tasks.push(t)
  for (const b of Object.values(buckets)) b.tasks.sort((a, z) => priorityMeta[z.priority].rank - priorityMeta[a.priority].rank)
  return Object.values(buckets).filter((b) => b.tasks.length)
})

const open = ref<{ id: number; key: string } | null>(null)
</script>

<template>
  <UDashboardPanel id="my-tasks">
    <template #header>
      <AppNavbar title="My tasks" />
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-4xl space-y-8">
        <UEmpty v-if="!data.tasks.length" icon="i-lucide-party-popper" title="Nothing assigned to you" description="Open tasks assigned to you across all projects show up here." />

        <section v-for="group in groups" :key="group.label" class="space-y-2">
          <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
            <UIcon :name="group.icon" class="size-4 text-muted" />
            {{ group.label }}
            <UBadge :label="String(group.tasks.length)" color="neutral" variant="subtle" size="sm" />
          </h2>
          <ul class="divide-y divide-default overflow-hidden rounded-xl ring ring-default">
            <li v-for="t in group.tasks" :key="t.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 bg-default px-4 py-2.5 text-left transition hover:bg-elevated/60"
                @click="open = { id: t.id, key: projectById.get(t.projectId)!.key }"
              >
                <UIcon :name="priorityMeta[t.priority].icon" class="size-4 shrink-0" :class="priorityMeta[t.priority].class" />
                <span class="w-16 shrink-0 font-mono text-xs text-muted">{{ t.ref }}</span>
                <span class="min-w-0 flex-1 truncate text-sm text-highlighted">{{ t.title }}</span>
                <span class="hidden items-center gap-1 sm:flex">
                  <span v-for="id in t.labelIds" :key="id" class="rounded px-1.5 py-0.5 text-[11px]" :class="[color(labelById.get(id)?.color).soft, color(labelById.get(id)?.color).text]">
                    {{ labelById.get(id)?.name }}
                  </span>
                </span>
                <span class="hidden items-center gap-1.5 text-xs text-muted md:flex">
                  <span class="size-2 rounded-full" :class="color(statusOf(t)?.color).dot" />
                  {{ statusOf(t)?.name }}
                </span>
                <span
                  v-if="t.dueDate"
                  class="w-16 shrink-0 text-right text-xs"
                  :class="dueState(t.dueDate) === 'overdue' ? 'text-error' : dueState(t.dueDate) === 'soon' ? 'text-warning' : 'text-muted'"
                >
                  {{ formatDay(t.dueDate) }}
                </span>
                <span class="flex w-20 shrink-0 items-center justify-end gap-1.5 text-xs text-muted">
                  <span class="size-2 rounded-sm" :class="color(projectById.get(t.projectId)?.color).dot" />
                  <span class="truncate">{{ projectById.get(t.projectId)?.key }}</span>
                </span>
              </button>
            </li>
          </ul>
        </section>
      </div>
      <ProjectTaskPanel :task-id="open?.id ?? null" :project-key="open?.key ?? ''" @close="open = null" />
    </template>
  </UDashboardPanel>
</template>
