<script setup lang="ts">
/** Task history as short sentences ("alice changed status from To do to In progress · 2h ago"). Newest first. */
const props = defineProps<{ activity: TaskActivityDTO[] }>()

interface Part {
  text: string
  strong?: boolean
}

const DATE_FIELDS: Record<string, string> = { startDate: 'start date', dueDate: 'due date' }

function priority(value: string | null) {
  return value && value in priorityMeta ? priorityMeta[value as TaskPriority].label : (value ?? '')
}

function sentence(a: TaskActivityDTO): { icon: string; parts: Part[] } {
  const from = a.fromValue
  const to = a.toValue
  switch (a.field) {
    case 'created':
      return { icon: 'i-lucide-circle-plus', parts: [{ text: 'created the task' }] }
    case 'title':
      return { icon: 'i-lucide-pencil', parts: [{ text: 'renamed the task to ' }, { text: to ?? '', strong: true }] }
    case 'description':
      return { icon: 'i-lucide-text', parts: [{ text: 'updated the description' }] }
    case 'status':
      return {
        icon: 'i-lucide-circle-dashed',
        parts: from
          ? [{ text: 'changed status from ' }, { text: from, strong: true }, { text: ' to ' }, { text: to ?? '', strong: true }]
          : [{ text: 'moved the task to ' }, { text: to ?? '', strong: true }],
      }
    case 'priority':
      if (!to || to === 'none') return { icon: 'i-lucide-minus', parts: [{ text: 'removed the priority' }] }
      return {
        icon: priorityMeta[to as TaskPriority]?.icon ?? 'i-lucide-signal',
        parts:
          from && from !== 'none'
            ? [{ text: 'changed priority from ' }, { text: priority(from), strong: true }, { text: ' to ' }, { text: priority(to), strong: true }]
            : [{ text: 'set priority to ' }, { text: priority(to), strong: true }],
      }
    case 'assignee':
      if (!to) return { icon: 'i-lucide-user-minus', parts: [{ text: 'unassigned ' }, { text: from ?? 'the task', strong: !!from }] }
      return {
        icon: 'i-lucide-user-plus',
        parts: from
          ? [{ text: 'reassigned the task from ' }, { text: from, strong: true }, { text: ' to ' }, { text: to, strong: true }]
          : [{ text: 'assigned the task to ' }, { text: to, strong: true }],
      }
    case 'startDate':
    case 'dueDate': {
      const name = DATE_FIELDS[a.field]!
      if (!to) return { icon: 'i-lucide-calendar-x', parts: [{ text: `cleared the ${name}` }] }
      return {
        icon: 'i-lucide-calendar',
        parts: from
          ? [{ text: `changed the ${name} from ` }, { text: formatDay(from), strong: true }, { text: ' to ' }, { text: formatDay(to), strong: true }]
          : [{ text: `set the ${name} to ` }, { text: formatDay(to), strong: true }],
      }
    }
    case 'labels':
      return { icon: 'i-lucide-tag', parts: [{ text: 'updated the labels' }] }
    case 'attachment':
      return to
        ? { icon: 'i-lucide-paperclip', parts: [{ text: 'attached ' }, { text: to, strong: true }] }
        : { icon: 'i-lucide-file-x', parts: [{ text: 'removed ' }, { text: from ?? 'a file', strong: !!from }] }
    default:
      return { icon: 'i-lucide-history', parts: [{ text: `updated ${a.field}` }] }
  }
}

const entries = computed(() => props.activity.map((a) => ({ ...a, ...sentence(a) })))
</script>

<template>
  <p v-if="!entries.length" class="py-2 text-sm text-muted">No activity yet.</p>
  <ol v-else class="relative space-y-3 before:absolute before:inset-y-1 before:left-[0.6875rem] before:w-px before:bg-(--ui-border)">
    <li v-for="entry in entries" :key="entry.id" class="relative flex items-start gap-3 text-sm">
      <span class="z-10 grid size-6 shrink-0 place-items-center rounded-full bg-default ring ring-default">
        <UIcon :name="entry.icon" class="size-3.5 text-muted" />
      </span>
      <p class="min-w-0 pt-0.5 text-muted">
        <span class="font-medium text-highlighted">{{ entry.actorName }}</span>
        {{ ' ' }}
        <template v-for="(part, i) in entry.parts" :key="i">
          <span v-if="part.strong" class="font-medium text-default">{{ part.text }}</span>
          <template v-else>{{ part.text }}</template>
        </template>
        <span class="text-dimmed"> · </span>
        <NuxtTime :datetime="entry.createdAt" relative :title="formatDateTime(entry.createdAt)" class="text-dimmed" />
      </p>
    </li>
  </ol>
</template>
