<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

const open = defineModel<boolean>('open', { default: false })
const toast = useToast()
const { upsert } = useProjects()

const schema = z.object({
  name: z.string().trim().min(1, 'Name the project').max(80),
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/, '2-10 letters or digits, starting with a letter'),
  description: z.string().max(2000).optional(),
  color: z.enum(PALETTE),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ name: '', key: '', description: '', color: 'indigo' })
const keyTouched = ref(false)
const loading = ref(false)

watch(
  () => state.name,
  (name) => {
    if (keyTouched.value) return
    const words = (name ?? '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
    state.key = words.length > 1 ? words.map((w) => w[0]).join('').slice(0, 4) : (words[0] ?? '').slice(0, 3)
  },
)
watch(open, (value) => {
  if (!value) return
  Object.assign(state, { name: '', key: '', description: '', color: 'indigo' })
  keyTouched.value = false
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    const project = await $fetch<ProjectDTO>('/api/projects', { method: 'POST', body: event.data })
    upsert(project)
    open.value = false
    await navigateTo(`/projects/${project.key}`)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not create the project') })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" title="New project" description="Projects hold tasks on a board with your own columns.">
    <template #body>
      <UForm id="new-project" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <div class="grid grid-cols-[1fr_7rem] gap-3">
          <UFormField label="Name" name="name">
            <UInput v-model="state.name" placeholder="Website relaunch" class="w-full" autofocus />
          </UFormField>
          <UFormField label="Key" name="key" hint="WEB-1">
            <UInput v-model="state.key" class="w-full font-mono uppercase" maxlength="10" @input="keyTouched = true" />
          </UFormField>
        </div>
        <UFormField label="Description" name="description">
          <UTextarea v-model="state.description" :rows="2" autoresize placeholder="What is this project about?" class="w-full" />
        </UFormField>
        <UFormField label="Colour" name="color">
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="c in PALETTE"
              :key="c"
              type="button"
              class="grid size-7 place-items-center rounded-md ring-offset-2 ring-offset-default transition"
              :class="[color(c).soft, state.color === c ? 'ring-2 ring-primary' : 'hover:ring-1 hover:ring-default']"
              :aria-label="c"
              :aria-pressed="state.color === c"
              @click="state.color = c"
            >
              <span class="size-3 rounded-sm" :class="color(c).dot" />
            </button>
          </div>
        </UFormField>
        <p class="text-xs text-muted">Starts with the columns To do, In progress, In review and Done. You can change them later.</p>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
        <UButton type="submit" form="new-project" :loading="loading" label="Create project" />
      </div>
    </template>
  </UModal>
</template>
