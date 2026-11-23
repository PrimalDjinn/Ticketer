<script setup lang="ts">
const props = defineProps<{
  task: TaskDTO
  labels: LabelDTO[]
  members: PublicUser[]
  done?: boolean
}>()
defineEmits<{ open: [task: TaskDTO] }>()

const taskLabels = computed(() => props.task.labelIds.map((id) => props.labels.find((l) => l.id === id)).filter((l): l is LabelDTO => !!l))
const assignee = computed(() => props.members.find((m) => m.id === props.task.assigneeId) ?? null)
const due = computed(() => dueState(props.task.dueDate, props.done))
const priority = computed(() => priorityMeta[props.task.priority])
</script>

<template>
  <button
    type="button"
    :data-task-id="task.id"
    class="group flex w-full flex-col gap-2 rounded-md border border-default bg-default p-2.5 text-left shadow-xs transition hover:border-accented hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    :class="done && 'opacity-70'"
    @click="$emit('open', task)"
  >
    <div class="flex items-start gap-2">
      <div class="min-w-0 flex-1">
        <p class="font-mono text-[11px] leading-4 text-dimmed">{{ task.ref }}</p>
        <p class="line-clamp-2 text-sm leading-5 font-medium text-highlighted" :class="done && 'line-through decoration-muted'">{{ task.title }}</p>
      </div>
      <UAvatar v-if="assignee" :alt="assignee.name" size="2xs" class="mt-0.5 shrink-0" :title="assignee.name" />
    </div>

    <div v-if="task.priority !== 'none' || taskLabels.length || task.dueDate || task.subtaskCount || task.commentCount || task.attachmentCount" class="flex flex-wrap items-center gap-1.5 text-xs text-muted">
      <span v-if="task.priority !== 'none'" class="inline-flex items-center" :title="`Priority: ${priority.label}`">
        <UIcon :name="priority.icon" class="size-3.5" :class="priority.class" />
        <span class="sr-only">Priority: {{ priority.label }}</span>
      </span>
      <span
        v-for="label in taskLabels"
        :key="label.id"
        class="inline-flex max-w-32 items-center gap-1 truncate rounded-full px-1.5 py-px text-[11px] leading-4 font-medium"
        :class="[color(label.color).soft, color(label.color).text]"
      >
        <span class="size-1.5 shrink-0 rounded-full" :class="color(label.color).dot" />
        <span class="truncate">{{ label.name }}</span>
      </span>
      <span
        v-if="task.dueDate"
        class="inline-flex items-center gap-1"
        :class="{ 'text-error': due === 'overdue', 'text-warning': due === 'soon' }"
        :title="due === 'overdue' ? 'Overdue' : 'Due date'"
      >
        <UIcon name="i-lucide-calendar" class="size-3.5" />
        {{ formatDay(task.dueDate) }}
      </span>
      <span v-if="task.subtaskCount" class="inline-flex items-center gap-1" :class="task.subtaskDoneCount === task.subtaskCount && 'text-success'" title="Subtasks done">
        <UIcon name="i-lucide-list-checks" class="size-3.5" />
        {{ task.subtaskDoneCount }}/{{ task.subtaskCount }}
      </span>
      <span v-if="task.commentCount" class="inline-flex items-center gap-1" :title="`${task.commentCount} comments`">
        <UIcon name="i-lucide-message-square" class="size-3.5" />
        {{ task.commentCount }}
      </span>
      <span v-if="task.attachmentCount" class="inline-flex items-center gap-1" :title="`${task.attachmentCount} attachments`">
        <UIcon name="i-lucide-paperclip" class="size-3.5" />
        {{ task.attachmentCount }}
      </span>
    </div>
  </button>
</template>
