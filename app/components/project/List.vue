<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { TaskMove } from './Board.vue'

const props = defineProps<{
  projectKey: string
  statuses: StatusDTO[]
  tasks: TaskDTO[]
  labels: LabelDTO[]
  members: PublicUser[]
  readonly?: boolean
}>()
const emit = defineEmits<{
  open: [task: TaskDTO]
  move: [move: TaskMove]
  created: [task: TaskDTO]
}>()

const { filters, setFilters } = useTaskFilters()

const sortItems = TASK_SORTS.map((value) => ({ label: taskSortLabels[value], value }))
const sort = computed({
  get: () => filters.value.sort,
  set: (value: TaskSort) => setFilters({ sort: value }),
})

const groups = computed(() =>
  [...props.statuses]
    .sort((a, b) => a.position - b.position)
    .map((status) => ({ status, tasks: sortTasks(props.tasks.filter((t) => t.statusId === status.id), sort.value) })),
)

const collapsed = ref(new Set<number>())
function toggle(id: number) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  collapsed.value = next
}

const adding = ref<number | null>(null)

const labelsById = computed(() => new Map(props.labels.map((l) => [l.id, l])))
const membersById = computed(() => new Map(props.members.map((m) => [m.id, m])))

const statusIcon = (status: StatusDTO) => (status.isDone ? 'i-lucide-circle-check' : 'i-lucide-circle')

function statusItems(task: TaskDTO): DropdownMenuItem[] {
  return groups.value.map(({ status }) => ({
    label: status.name,
    icon: statusIcon(status),
    type: 'checkbox' as const,
    checked: status.id === task.statusId,
    ui: { itemLeadingIcon: color(status.color).text },
    onUpdateChecked: () => {
      if (status.id !== task.statusId) emit('move', { taskId: task.id, statusId: status.id, prevId: null, nextId: null })
    },
  }))
}
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col overflow-y-auto">
    <div class="flex items-center justify-end gap-2 px-4 pt-3 pb-1 sm:px-6">
      <span class="text-xs text-muted">Sort by</span>
      <USelect v-model="sort" :items="sortItems" size="xs" variant="ghost" class="w-28" aria-label="Sort tasks" />
    </div>

    <div class="pb-8">
      <section v-for="{ status, tasks: groupTasks } in groups" :key="status.id" :aria-label="status.name">
        <div class="sticky top-0 z-10 flex items-center gap-1 border-y border-default bg-elevated/80 px-2 backdrop-blur sm:px-4">
          <button
            type="button"
            class="flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-primary"
            :aria-expanded="!collapsed.has(status.id)"
            @click="toggle(status.id)"
          >
            <UIcon name="i-lucide-chevron-right" class="size-4 shrink-0 text-dimmed transition-transform" :class="!collapsed.has(status.id) && 'rotate-90'" />
            <span class="size-2 shrink-0 rounded-full" :class="color(status.color).dot" />
            <span class="truncate text-sm font-medium text-highlighted">{{ status.name }}</span>
            <span class="text-xs text-dimmed tabular-nums">{{ groupTasks.length }}</span>
          </button>
          <UTooltip v-if="!readonly" :text="`Add task to ${status.name}`">
            <UButton
              icon="i-lucide-plus"
              size="xs"
              color="neutral"
              variant="ghost"
              :aria-label="`Add task to ${status.name}`"
              @click="collapsed.delete(status.id); adding = status.id"
            />
          </UTooltip>
        </div>

        <ul v-if="!collapsed.has(status.id)" class="divide-y divide-default">
          <li
            v-for="task in groupTasks"
            :key="task.id"
            class="group relative flex items-center gap-3 px-4 py-2 transition-colors hover:bg-elevated/50 focus-within:bg-elevated/50 sm:px-6"
          >
            <UDropdownMenu v-if="!readonly" :items="statusItems(task)" :content="{ align: 'start' }">
              <UButton
                :icon="statusIcon(status)"
                size="xs"
                color="neutral"
                variant="ghost"
                class="relative z-1 -mx-1"
                :class="color(status.color).text"
                :aria-label="`Status: ${status.name}. Change status`"
              />
            </UDropdownMenu>
            <UIcon v-else :name="statusIcon(status)" class="size-4 shrink-0" :class="color(status.color).text" />

            <span class="hidden w-16 shrink-0 font-mono text-xs text-dimmed sm:inline">{{ task.ref }}</span>

            <!-- Stretched button: the whole row opens the task while the status menu stays clickable. -->
            <button
              type="button"
              class="min-w-0 flex-1 truncate text-left text-sm text-highlighted before:absolute before:inset-0 focus-visible:outline-none focus-visible:before:outline-2 focus-visible:before:-outline-offset-2 focus-visible:before:outline-primary"
              :class="status.isDone && 'text-muted line-through decoration-muted'"
              @click="emit('open', task)"
            >
              <span class="me-1.5 font-mono text-xs text-dimmed sm:hidden">{{ task.ref }}</span>{{ task.title }}
            </button>

            <div class="pointer-events-none flex shrink-0 items-center gap-2 text-xs text-muted">
              <span class="hidden items-center gap-1 lg:flex">
                <template v-for="id in task.labelIds" :key="id">
                  <span
                    v-if="labelsById.get(id)"
                    class="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[11px] font-medium"
                    :class="[color(labelsById.get(id)!.color).soft, color(labelsById.get(id)!.color).text]"
                  >
                    <span class="size-1.5 rounded-full" :class="color(labelsById.get(id)!.color).dot" />
                    {{ labelsById.get(id)!.name }}
                  </span>
                </template>
              </span>
              <span v-if="task.subtaskCount" class="hidden items-center gap-1 md:inline-flex" title="Subtasks done">
                <UIcon name="i-lucide-list-checks" class="size-3.5" />{{ task.subtaskDoneCount }}/{{ task.subtaskCount }}
              </span>
              <span class="inline-flex w-4 justify-center" :title="priorityMeta[task.priority].label">
                <UIcon :name="priorityMeta[task.priority].icon" class="size-4" :class="priorityMeta[task.priority].class" />
                <span class="sr-only">Priority: {{ priorityMeta[task.priority].label }}</span>
              </span>
              <span
                class="hidden w-14 items-center justify-end sm:inline-flex"
                :class="{
                  'text-error': dueState(task.dueDate, status.isDone) === 'overdue',
                  'text-warning': dueState(task.dueDate, status.isDone) === 'soon',
                }"
              >
                {{ formatDay(task.dueDate) }}
              </span>
              <span class="inline-flex w-6 justify-center">
                <UAvatar v-if="task.assigneeId && membersById.get(task.assigneeId)" :alt="membersById.get(task.assigneeId)!.name" size="2xs" :title="membersById.get(task.assigneeId)!.name" />
                <UIcon v-else name="i-lucide-circle-user" class="size-4 text-dimmed" aria-label="Unassigned" />
              </span>
            </div>
          </li>
          <li v-if="!groupTasks.length && adding !== status.id" class="px-6 py-2 text-xs text-dimmed sm:px-10">No tasks</li>
          <li v-if="!readonly && adding === status.id" class="px-4 py-2 sm:px-6">
            <ProjectQuickAdd :project-key="projectKey" :status-id="status.id" @created="(task) => emit('created', task)" @cancel="adding = null" />
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
