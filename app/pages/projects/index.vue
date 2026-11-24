<script setup lang="ts">
definePageMeta({ middleware: ['auth', 'internal'] })
useSeoMeta({ title: 'Projects' })

const { user } = useUserSession()
const { projects, refresh } = useProjects()
await refresh()
const newProjectOpen = ref(false)
const showArchived = ref(false)
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'member')
const visible = computed(() => projects.value.filter((p) => showArchived.value || !p.archivedAt))
const archivedCount = computed(() => projects.value.filter((p) => p.archivedAt).length)

function progress(p: ProjectDTO) {
  return p.taskCount ? Math.round(((p.taskCount - p.openCount) / p.taskCount) * 100) : 0
}
</script>

<template>
  <UDashboardPanel id="projects">
    <template #header>
      <AppNavbar title="Projects">
        <template #right>
          <UButton v-if="canEdit" icon="i-lucide-plus" label="New project" class="hidden sm:inline-flex" @click="newProjectOpen = true" />
        </template>
      </AppNavbar>
    </template>

    <template #body>
      <div class="mx-auto w-full max-w-6xl space-y-6">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted">{{ visible.length }} project{{ visible.length === 1 ? '' : 's' }}</p>
          <USwitch v-if="archivedCount" v-model="showArchived" :label="`Show archived (${archivedCount})`" size="sm" />
        </div>

        <UEmpty
          v-if="!visible.length"
          icon="i-lucide-folder-kanban"
          title="No projects yet"
          description="Projects group tasks on a board with your own workflow."
          :actions="canEdit ? [{ label: 'Create a project', icon: 'i-lucide-plus', onClick: () => (newProjectOpen = true) }] : []"
        />

        <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <NuxtLink
            v-for="p in visible"
            :key="p.id"
            :to="`/projects/${p.key}`"
            class="group flex flex-col gap-4 rounded-xl bg-default p-5 ring ring-default transition hover:-translate-y-0.5 hover:shadow-md hover:ring-primary/40"
            :class="{ 'opacity-60': !!p.archivedAt }"
          >
            <div class="flex items-start gap-3">
              <span class="grid size-10 shrink-0 place-items-center rounded-lg font-mono text-xs font-semibold" :class="[color(p.color).soft, color(p.color).text]">
                {{ p.key.slice(0, 3) }}
              </span>
              <div class="min-w-0">
                <p class="truncate font-semibold text-highlighted">{{ p.name }}</p>
                <p class="line-clamp-2 text-sm text-muted">{{ p.description || 'No description' }}</p>
              </div>
              <UBadge v-if="p.archivedAt" label="Archived" color="neutral" variant="subtle" size="sm" class="ml-auto" />
            </div>
            <div class="mt-auto space-y-1.5">
              <div class="flex justify-between text-xs text-muted">
                <span>{{ p.openCount }} open · {{ p.taskCount }} total</span>
                <span>{{ progress(p) }}%</span>
              </div>
              <UProgress :model-value="progress(p)" size="xs" />
            </div>
          </NuxtLink>
        </div>
      </div>
      <NewProjectModal v-model:open="newProjectOpen" />
    </template>
  </UDashboardPanel>
</template>
