<script setup lang="ts">
/** Project settings → GitHub: the repository this project syncs with, what flows which way, and the issue import. */
const props = defineProps<{ project: ProjectDTO }>()
const toast = useToast()
const { user } = useUserSession()
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'member')
const isAdmin = computed(() => user.value?.role === 'admin')

interface LinkView {
  repoId: number
  installationId: number
  repoFullName: string
  url: string
  createIssues: boolean
  importIssues: boolean
  commentsFromGithub: boolean
  commentsToGithub: boolean
  linkedTasks: number
}
interface Repo {
  id: number
  fullName: string
  private: boolean
  url: string
  installationId: number
  linkedTo: { key: string; name: string } | null
}

const { data, refresh } = await useFetch<{ available: boolean; link: LinkView | null }>(() => `/api/projects/${props.project.key}/github`)
const repos = ref<{ repositories: Repo[]; installations: number; problems: string[] } | null>(null)
const loadingRepos = ref(false)
async function loadRepos() {
  loadingRepos.value = true
  try {
    repos.value = await $fetch<{ repositories: Repo[]; installations: number; problems: string[] }>('/api/github/repositories')
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not list repositories'), color: 'error' })
  } finally {
    loadingRepos.value = false
  }
}
watch(
  () => data.value?.available && !data.value.link,
  (needed) => needed && canEdit.value && !repos.value && loadRepos(),
  { immediate: true },
)

const options = reactive({ createIssues: true, importIssues: true, commentsFromGithub: true, commentsToGithub: false })
watch(
  () => data.value?.link,
  (link) => {
    if (link) Object.assign(options, { createIssues: link.createIssues, importIssues: link.importIssues, commentsFromGithub: link.commentsFromGithub, commentsToGithub: link.commentsToGithub })
  },
  { immediate: true },
)

const repoItems = computed(() =>
  (repos.value?.repositories ?? []).map((r) => ({
    label: r.fullName,
    value: r.id,
    icon: r.private ? 'i-lucide-lock' : 'i-lucide-book-marked',
    disabled: !!r.linkedTo && r.linkedTo.key !== props.project.key,
    suffix: r.linkedTo && r.linkedTo.key !== props.project.key ? `linked to ${r.linkedTo.key}` : undefined,
  })),
)
const chosen = ref<number | undefined>()
const saving = ref(false)
async function save(repoId = data.value?.link?.repoId ?? chosen.value) {
  if (!repoId) return
  const installationId = repos.value?.repositories.find((r) => r.id === repoId)?.installationId ?? data.value?.link?.installationId
  if (!installationId) return
  saving.value = true
  try {
    const body = { repoId, installationId, ...options }
    const result = await $fetch<{ repoFullName: string }>(`/api/projects/${props.project.key}/github`, { method: 'PUT', body })
    await refresh()
    toast.add({ title: data.value?.link && !chosen.value ? 'Sync options saved' : `Linked to ${result.repoFullName}`, color: 'success' })
    chosen.value = undefined
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not link the repository'), color: 'error' })
  } finally {
    saving.value = false
  }
}

const importing = ref(false)
async function importIssues() {
  importing.value = true
  try {
    let total = 0
    for (let round = 0; round < 10; round++) {
      const result = await $fetch<{ imported: number; more: boolean }>(`/api/projects/${props.project.key}/github/import`, { method: 'POST' })
      total += result.imported
      if (!result.more) break
    }
    await refresh()
    toast.add({ title: total ? `Imported ${total} open ${total === 1 ? 'issue' : 'issues'}` : 'Every open issue is already a task', color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not import issues'), color: 'error' })
  } finally {
    importing.value = false
  }
}

const confirmUnlink = ref(false)
async function unlink() {
  await $fetch(`/api/projects/${props.project.key}/github`, { method: 'DELETE' })
  confirmUnlink.value = false
  await refresh()
  await loadRepos()
}

const installing = ref(false)
async function install() {
  installing.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/github/install-link', { query: { return: `/projects/${props.project.key}` } })
    window.location.href = url
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
    installing.value = false
  }
}

const toggles = [
  { key: 'createIssues', label: 'New tasks become issues', description: 'Tasks created here get an issue on GitHub.' },
  { key: 'importIssues', label: 'New issues become tasks', description: 'Issues opened on GitHub appear in the first column.' },
  { key: 'commentsFromGithub', label: 'Bring in comments from GitHub', description: 'Shown on the task with the GitHub user’s name.' },
  { key: 'commentsToGithub', label: 'Post task comments to GitHub', description: 'Off by default: task comments are for the team, and the repository may be public.' },
] as const
</script>

<template>
  <div v-if="data" class="space-y-5">
    <div>
      <h3 class="text-sm font-semibold text-highlighted">GitHub issues</h3>
      <p class="text-sm text-muted">Keep this project’s tasks and a repository’s issues in step: titles, descriptions, open or done, labels and comments.</p>
    </div>

    <UAlert v-if="!data.available" color="neutral" variant="subtle" icon="i-lucide-github" title="GitHub isn’t set up on this site">
      <template #description>
        <template v-if="isAdmin">
          Create the GitHub App in <ULink to="/settings/github" class="text-primary">Settings → GitHub</ULink> first.
        </template>
        <template v-else>Ask an admin to set it up in Settings → GitHub.</template>
      </template>
    </UAlert>

    <!-- Linked -->
    <template v-else-if="data.link">
      <div class="flex flex-wrap items-center gap-3 rounded-lg border border-default px-4 py-3">
        <UIcon name="i-lucide-github" class="size-5" />
        <div class="min-w-0 flex-1">
          <ULink :to="data.link.url" target="_blank" class="font-medium text-highlighted hover:underline">{{ data.link.repoFullName }}</ULink>
          <p class="text-xs text-muted">{{ data.link.linkedTasks }} {{ data.link.linkedTasks === 1 ? 'task is' : 'tasks are' }} linked to issues</p>
        </div>
        <UButton v-if="canEdit" label="Import open issues" icon="i-lucide-download" color="neutral" variant="outline" size="sm" :loading="importing" @click="importIssues" />
        <UButton v-if="canEdit" label="Unlink" color="neutral" variant="ghost" size="sm" @click="confirmUnlink = true" />
      </div>
      <div class="divide-y divide-default rounded-lg border border-default">
        <div v-for="t in toggles" :key="t.key" class="flex items-start justify-between gap-4 px-4 py-3">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ t.label }}</p>
            <p class="text-sm text-muted">{{ t.description }}</p>
          </div>
          <USwitch v-model="options[t.key]" :disabled="!canEdit" :aria-label="t.label" />
        </div>
      </div>
      <div v-if="canEdit" class="flex justify-end">
        <UButton label="Save" :loading="saving" @click="save()" />
      </div>
    </template>

    <!-- Not linked -->
    <template v-else-if="canEdit">
      <div class="space-y-3">
        <UFormField label="Repository">
          <div class="flex gap-2">
            <USelectMenu
              v-model="chosen"
              :items="repoItems"
              value-key="value"
              :loading="loadingRepos"
              placeholder="Choose a repository"
              class="flex-1"
              :search-input="{ placeholder: 'Search repositories' }"
            />
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="loadingRepos" aria-label="Reload repositories" @click="loadRepos" />
          </div>
        </UFormField>
        <p v-if="repos && !repos.installations" class="text-sm text-muted">The app isn’t installed on any GitHub account yet.</p>
        <p v-else-if="repos && !repos.repositories.length" class="text-sm text-muted">The app can’t reach any repositories. Give it access on GitHub.</p>
        <p v-for="p in repos?.problems ?? []" :key="p" class="text-xs text-warning">{{ p }}</p>
        <UButton :label="repos?.installations ? 'Add an account or repositories on GitHub' : 'Install on GitHub'" icon="i-lucide-plus" color="neutral" variant="link" class="px-0" :loading="installing" @click="install" />
      </div>
      <div class="divide-y divide-default rounded-lg border border-default">
        <div v-for="t in toggles" :key="t.key" class="flex items-start justify-between gap-4 px-4 py-3">
          <div>
            <p class="text-sm font-medium text-highlighted">{{ t.label }}</p>
            <p class="text-sm text-muted">{{ t.description }}</p>
          </div>
          <USwitch v-model="options[t.key]" :aria-label="t.label" />
        </div>
      </div>
      <div class="flex justify-end">
        <UButton label="Link repository" icon="i-lucide-link" :loading="saving" :disabled="!chosen" @click="save(chosen)" />
      </div>
      <p class="text-xs text-dimmed">Existing tasks and issues aren’t touched when linking. Use <strong>Import open issues</strong> afterwards to bring issues in.</p>
    </template>
    <p v-else class="text-sm text-muted">Not linked to a repository.</p>

    <UModal v-model:open="confirmUnlink" title="Unlink the repository?" description="Tasks and issues both stay; they just stop syncing. Linking again later starts fresh.">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Keep it" color="neutral" variant="ghost" @click="confirmUnlink = false" />
          <UButton label="Unlink" color="error" @click="unlink" />
        </div>
      </template>
    </UModal>
  </div>
</template>
