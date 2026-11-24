<script setup lang="ts">
/** Settings → GitHub: the GitHub App that syncs issues with project tasks, and where it's installed. */
definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'GitHub · Settings' })

type Source = 'env' | 'settings' | 'unset'
interface GithubSettingsView {
  configured: boolean
  problem: string | null
  appId: string
  slug: string
  owner: string
  appUrl: string | null
  installUrl: string | null
  privateKeySet: boolean
  webhookSecretSet: boolean
  sources: Record<'appId' | 'slug' | 'privateKey' | 'webhookSecret', Source>
  webUrl: string
  webhookUrl: string
  installations: { id: number; account: string; type: string; suspended: boolean }[]
}

const toast = useToast()
const route = useRoute()
const { site } = useSite()
const { data, refresh } = await useFetch<GithubSettingsView>('/api/settings/github')

onMounted(() => {
  if (route.query.created) toast.add({ title: 'GitHub App created', description: 'Now install it on the account or organisation that owns your repositories.', color: 'success' })
  if (route.query.github === 'installed') toast.add({ title: 'Installed on GitHub', color: 'success' })
})

// --- create with the app-manifest flow ------------------------------------------------------------------------------
const create = reactive({ organization: '', name: `${site.value.name} issues sync`.slice(0, 34) })
const creating = ref(false)
async function createApp() {
  creating.value = true
  try {
    const form = await $fetch<{ action: string; manifest: string }>('/api/settings/github/manifest', { method: 'POST', body: create })
    // GitHub's manifest flow needs a real form POST from the browser.
    const el = document.createElement('form')
    el.method = 'post'
    el.action = form.action
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'manifest'
    input.value = form.manifest
    el.appendChild(input)
    document.body.appendChild(el)
    el.submit()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not start'), color: 'error' })
    creating.value = false
  }
}

// --- enter an existing app by hand ---------------------------------------------------------------------------------
const manual = ref(false)
const form = reactive({ appId: '', slug: '', privateKey: '', webhookSecret: '' })
watch(
  data,
  (value) => {
    if (value) Object.assign(form, { appId: value.appId, slug: value.slug, privateKey: '', webhookSecret: '' })
  },
  { immediate: true },
)
const locked = (field: keyof GithubSettingsView['sources']) => data.value?.sources[field] === 'env'
const saving = ref(false)
async function saveManual() {
  saving.value = true
  try {
    await $fetch('/api/settings/github', {
      method: 'PUT',
      body: { appId: form.appId, slug: form.slug, privateKey: form.privateKey || undefined, webhookSecret: form.webhookSecret || undefined },
    })
    await refresh()
    manual.value = false
    toast.add({ title: 'GitHub App saved', color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save'), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- installations ---------------------------------------------------------------------------------------------------
const installing = ref(false)
async function install() {
  installing.value = true
  try {
    const { url } = await $fetch<{ url: string }>('/api/github/install-link', { query: { return: '/settings/github' } })
    window.location.href = url
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
    installing.value = false
  }
}
const syncing = ref(false)
async function reloadInstallations() {
  syncing.value = true
  try {
    const { count } = await $fetch<{ count: number }>('/api/settings/github/installations', { method: 'POST' })
    await refresh()
    toast.add({ title: count ? `Installed on ${count} ${count === 1 ? 'account' : 'accounts'}` : 'Not installed anywhere yet', color: count ? 'success' : 'warning' })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    syncing.value = false
  }
}

const confirmForget = ref(false)
async function forget() {
  await $fetch('/api/settings/github', { method: 'DELETE' })
  confirmForget.value = false
  await refresh()
}

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied', icon: 'i-lucide-copy-check' })
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">GitHub</h1>
      <p class="text-sm text-muted">
        Sync a project’s tasks with a repository’s issues, both ways: new issues become tasks, tasks become issues, and titles, descriptions, open/closed,
        labels and comments stay in step. Each project picks its repository in its settings.
      </p>
    </div>

    <!-- Not set up -->
    <template v-if="!data.appId">
      <section class="space-y-4 rounded-lg border border-default p-5">
        <div>
          <h2 class="font-semibold text-highlighted">1. Create the GitHub App</h2>
          <p class="mt-1 text-sm text-muted">
            GitHub opens with everything filled in: permissions (issues), events and the webhook address. Confirm there, and you come back here with the
            app’s keys saved.
          </p>
        </div>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="App name" help="Must be unique on GitHub.">
            <UInput v-model="create.name" :maxlength="34" class="w-full" />
          </UFormField>
          <UFormField label="Organisation (optional)" help="Leave empty to create it under your own GitHub account.">
            <UInput v-model="create.organization" placeholder="acme" class="w-full" />
          </UFormField>
        </div>
        <div class="flex flex-wrap items-center gap-3">
          <UButton icon="i-lucide-github" label="Create on GitHub" :loading="creating" :disabled="create.name.trim().length < 3" @click="createApp" />
          <UButton variant="link" color="neutral" label="I already have an app" @click="manual = true" />
        </div>
        <p class="text-xs text-dimmed">GitHub must be able to reach {{ data.webhookUrl }} for changes made on GitHub to arrive.</p>
      </section>
    </template>

    <!-- Set up -->
    <template v-else>
      <UAlert
        v-if="data.problem"
        color="warning"
        variant="subtle"
        icon="i-lucide-circle-alert"
        title="GitHub sync isn’t working"
        :description="data.problem"
      />
      <section class="space-y-3 rounded-lg border border-default p-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div class="flex items-center gap-3">
            <span class="grid size-10 place-items-center rounded-lg bg-elevated"><UIcon name="i-lucide-github" class="size-6" /></span>
            <div>
              <p class="font-semibold text-highlighted">{{ data.slug || `App ${data.appId}` }}</p>
              <p class="text-sm text-muted">App ID {{ data.appId }}<template v-if="data.owner"> · owned by {{ data.owner }}</template></p>
            </div>
          </div>
          <div class="flex gap-2">
            <UButton v-if="data.appUrl" :to="`${data.appUrl}`" target="_blank" label="Open on GitHub" trailing-icon="i-lucide-arrow-up-right" color="neutral" variant="outline" size="sm" />
            <UButton label="Edit" color="neutral" variant="ghost" size="sm" @click="manual = !manual" />
          </div>
        </div>
        <dl class="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
          <dt class="text-muted">Webhook address</dt>
          <dd class="flex min-w-0 items-center gap-1">
            <code class="truncate text-xs">{{ data.webhookUrl }}</code>
            <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="Copy the webhook address" @click="copy(data.webhookUrl)" />
          </dd>
          <dt class="text-muted">Private key</dt>
          <dd>{{ data.privateKeySet ? (data.sources.privateKey === 'env' ? 'Set by NUXT_GITHUB_PRIVATE_KEY' : 'Saved, encrypted') : 'Missing' }}</dd>
          <dt class="text-muted">Webhook secret</dt>
          <dd>{{ data.webhookSecretSet ? (data.sources.webhookSecret === 'env' ? 'Set by NUXT_GITHUB_WEBHOOK_SECRET' : 'Saved, encrypted') : 'Missing' }}</dd>
        </dl>
      </section>

      <section class="space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-highlighted">{{ data.installations.length ? 'Installed on' : '2. Install the app' }}</h2>
            <p class="text-sm text-muted">Install it on the account or organisation that owns the repositories, and choose which repositories it may use.</p>
          </div>
          <div class="flex gap-2">
            <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" size="sm" :loading="syncing" aria-label="Check installations again" @click="reloadInstallations" />
            <UButton icon="i-lucide-plus" :label="data.installations.length ? 'Install on another account' : 'Install on GitHub'" size="sm" :loading="installing" :disabled="!!data.problem" @click="install" />
          </div>
        </div>
        <ul v-if="data.installations.length" class="divide-y divide-default rounded-lg border border-default">
          <li v-for="i in data.installations" :key="i.id" class="flex items-center gap-3 px-4 py-2.5">
            <UIcon :name="i.type === 'Organization' ? 'i-lucide-building-2' : 'i-lucide-user'" class="size-4 text-muted" />
            <span class="flex-1 text-sm text-highlighted">{{ i.account }}</span>
            <UBadge v-if="i.suspended" label="Suspended" color="warning" variant="subtle" />
            <UButton
              :to="`${data.webUrl}/${i.type === 'Organization' ? `organizations/${i.account}/` : ''}settings/installations/${i.id}`"
              target="_blank"
              label="Repositories"
              trailing-icon="i-lucide-arrow-up-right"
              color="neutral"
              variant="link"
              size="sm"
            />
          </li>
        </ul>
        <p v-if="data.installations.length" class="text-sm text-muted">Next: open a project, go to its settings, then <strong>GitHub</strong>, and choose a repository.</p>
      </section>
    </template>

    <!-- Manual entry -->
    <section v-if="manual" class="space-y-4 rounded-lg border border-default p-5">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">Enter an existing GitHub App</h2>
        <p class="text-sm text-muted">
          The app needs <strong>Issues: read and write</strong> and <strong>Metadata: read</strong>, the <strong>Issues</strong> and
          <strong>Issue comment</strong> events, and its webhook pointed at {{ data.webhookUrl }}.
        </p>
      </div>
      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="App ID" :help="locked('appId') ? 'Set by NUXT_GITHUB_APP_ID.' : undefined">
          <UInput v-model="form.appId" inputmode="numeric" class="w-full" :disabled="locked('appId')" />
        </UFormField>
        <UFormField label="URL name (slug)" :help="locked('slug') ? 'Set by NUXT_GITHUB_APP_SLUG.' : 'From the app’s address: github.com/apps/<slug>'">
          <UInput v-model="form.slug" class="w-full" :disabled="locked('slug')" />
        </UFormField>
      </div>
      <UFormField label="Private key" :help="locked('privateKey') ? 'Set by NUXT_GITHUB_PRIVATE_KEY.' : data.privateKeySet ? 'Saved. Leave empty to keep it.' : 'Paste the whole .pem file GitHub downloaded.'">
        <UTextarea v-model="form.privateKey" :rows="4" class="w-full font-mono text-xs" placeholder="-----BEGIN RSA PRIVATE KEY-----" :disabled="locked('privateKey')" />
      </UFormField>
      <UFormField label="Webhook secret" :help="locked('webhookSecret') ? 'Set by NUXT_GITHUB_WEBHOOK_SECRET.' : data.webhookSecretSet ? 'Saved. Leave empty to keep it.' : undefined">
        <UInput v-model="form.webhookSecret" type="password" autocomplete="new-password" class="w-full" :disabled="locked('webhookSecret')" />
      </UFormField>
      <div class="flex justify-between gap-2">
        <UButton v-if="data.appId" label="Forget this app" color="error" variant="ghost" @click="confirmForget = true" />
        <span v-else />
        <div class="flex gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="manual = false" />
          <UButton label="Save" :loading="saving" :disabled="!form.appId || !form.slug" @click="saveManual" />
        </div>
      </div>
    </section>

    <UModal v-model:open="confirmForget" title="Forget the GitHub App?" description="Ticketer stops syncing until an app is set up again. The app itself stays on GitHub; delete it there if you no longer need it.">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Keep it" color="neutral" variant="ghost" @click="confirmForget = false" />
          <UButton label="Forget" color="error" @click="forget" />
        </div>
      </template>
    </UModal>
  </div>
</template>
