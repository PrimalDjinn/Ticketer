<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ middleware: 'auth' })

const paramsSchema = z.object({
  key: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9]{1,9}$/),
  number: z.coerce.number().int().positive(),
})

const route = useRoute()
const params = computed(() => paramsSchema.safeParse(route.params))
if (!params.value.success) throw createError({ status: 404, message: 'Task not found', fatal: true })

const key = computed(() => params.value.data?.key ?? '')
const number = computed(() => params.value.data?.number ?? 0)
const reference = computed(() => `${key.value}-${number.value}`)

useSeoMeta({ title: () => `${reference.value} · Ticketer` })

async function onDeleted() {
  await navigateTo(`/projects/${key.value}`)
}
</script>

<template>
  <UDashboardPanel id="task">
    <template #header>
      <AppNavbar :title="reference">
        <template #right>
          <UButton :to="`/projects/${key}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Back to project" class="hidden sm:inline-flex" />
          <UButton :to="`/projects/${key}`" color="neutral" variant="ghost" icon="i-lucide-arrow-left" aria-label="Back to project" class="sm:hidden" />
        </template>
      </AppNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl">
        <ProjectTaskDetail :project-key="key" :number="number" @deleted="onDeleted" />
      </div>
    </template>
  </UDashboardPanel>
</template>
