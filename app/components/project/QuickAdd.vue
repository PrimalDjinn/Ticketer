<script setup lang="ts">
/** Inline "type a title, press Enter" task creation used by board columns and list groups. */
const props = defineProps<{ projectKey: string; statusId: number }>()
const emit = defineEmits<{ created: [task: TaskDTO]; cancel: [] }>()

const toast = useToast()
const title = ref('')
const saving = ref(false)

async function submit() {
  const value = title.value.trim()
  if (!value || saving.value) return
  saving.value = true
  try {
    const task = await $fetch<TaskDTO>(`/api/projects/${props.projectKey}/tasks`, { method: 'POST', body: { title: value, statusId: props.statusId } })
    title.value = ''
    emit('created', task)
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    saving.value = false
  }
}

function blur() {
  if (!title.value.trim() && !saving.value) emit('cancel')
}
</script>

<template>
  <UInput
    v-model="title"
    autofocus
    size="sm"
    placeholder="Task title, Enter to add"
    aria-label="New task title"
    :loading="saving"
    class="w-full"
    @keydown.enter.prevent="submit"
    @keydown.esc.prevent.stop="emit('cancel')"
    @blur="blur"
  />
</template>
