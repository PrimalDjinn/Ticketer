<script setup lang="ts">
/** Right-hand slide-over showing a task; open while `taskId` is set. Subtask and parent links open in place. */
const props = defineProps<{ taskId: number | null; projectKey: string }>()
const emit = defineEmits<{ close: [] }>()

// Follows the prop, but subtask/parent links can switch tasks without leaving the board.
const current = ref<number | null>(props.taskId)
watch(
  () => props.taskId,
  (id) => (current.value = id),
)

function onOpenChange(open: boolean) {
  if (!open) emit('close')
}
</script>

<template>
  <USlideover
    :open="taskId !== null"
    side="right"
    :close="false"
    title="Task"
    :ui="{ content: 'w-full sm:max-w-3xl', header: 'sr-only', body: 'p-4 sm:p-6' }"
    @update:open="onOpenChange"
  >
    <template #body>
      <ProjectTaskDetail v-if="current !== null" :key="projectKey" :task-id="current" compact @deleted="emit('close')" @open="(id) => (current = id)">
        <template #actions>
          <UTooltip text="Close" :kbds="['esc']">
            <UButton icon="i-lucide-x" color="neutral" variant="ghost" size="sm" aria-label="Close task" @click="emit('close')" />
          </UTooltip>
        </template>
      </ProjectTaskDetail>
    </template>
  </USlideover>
</template>
