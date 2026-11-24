<script setup lang="ts">
/** Asks before a ticket that already went to a project is handed off again. */
const open = defineModel<boolean>('open', { required: true })
defineProps<{
  /** References of the tasks already made from the ticket, e.g. `WEB-35`. */
  existing: string[]
  /** Project the new task would go to. */
  projectName: string
  loading?: boolean
}>()
const emit = defineEmits<{ confirm: [] }>()
</script>

<template>
  <UModal v-model:open="open" title="Create another task?">
    <template #body>
      <p class="text-sm">
        This ticket already has
        <template v-for="(ref, i) in existing" :key="ref">
          <span class="font-mono font-medium text-highlighted">{{ ref }}</span>{{ i < existing.length - 2 ? ', ' : i === existing.length - 2 ? ' and ' : '' }}
        </template>. Create another task for it in <span class="font-medium text-highlighted">{{ projectName }}</span>?
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton color="warning" icon="i-lucide-copy-plus" label="Create another task" :loading="loading" @click="emit('confirm')" />
      </div>
    </template>
  </UModal>
</template>
