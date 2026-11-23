<script setup lang="ts">
/** Compact task chip for the calendar: a real task, or a projected (ghost) occurrence of a repeating one. */
const props = defineProps<{
  task: TaskDTO
  done?: boolean
  /** Day of a projected occurrence; renders the chip as a dashed ghost. */
  ghostDay?: string | null
  assignee?: PublicUser | null
  draggable?: boolean
}>()
const emit = defineEmits<{ open: [task: TaskDTO]; dragstart: [event: DragEvent, task: TaskDTO]; dragend: [] }>()

const priority = computed(() => priorityMeta[props.task.priority])
const label = computed(() => {
  const parts = [props.task.ref, props.task.title]
  if (props.ghostDay) parts.push(`repeats on ${formatCalendarDay(props.ghostDay, { month: 'short', day: 'numeric' })}`)
  if (props.done) parts.push('done')
  if (props.task.priority !== 'none') parts.push(`${priority.value.label} priority`)
  return parts.join(', ')
})
</script>

<template>
  <button
    type="button"
    :data-task-id="ghostDay ? undefined : task.id"
    :data-ghost="ghostDay ? task.id : undefined"
    :draggable="draggable && !ghostDay ? 'true' : undefined"
    :aria-label="label"
    :title="`${task.ref} · ${task.title}`"
    class="group/chip flex w-full min-w-0 items-center gap-1 rounded px-1.5 py-0.5 text-left text-xs leading-5 transition focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary"
    :class="[
      ghostDay
        ? 'border border-dashed border-accented text-muted hover:bg-elevated/60'
        : 'border border-default bg-default text-highlighted shadow-xs hover:border-accented',
      draggable && !ghostDay && 'cursor-grab active:cursor-grabbing',
      done && 'opacity-60',
    ]"
    @click="emit('open', task)"
    @dragstart="emit('dragstart', $event, task)"
    @dragend="emit('dragend')"
  >
    <UIcon v-if="ghostDay" name="i-lucide-repeat" class="size-3 shrink-0 text-dimmed" />
    <UIcon v-else-if="task.priority !== 'none'" :name="priority.icon" class="size-3.5 shrink-0" :class="priority.class" />
    <span class="min-w-0 flex-1 truncate" :class="done && 'line-through decoration-muted'">{{ task.title }}</span>
    <UAvatar v-if="assignee" :alt="assignee.name" size="3xs" class="hidden shrink-0 group-hover/chip:inline-flex group-focus-visible/chip:inline-flex" />
  </button>
</template>
