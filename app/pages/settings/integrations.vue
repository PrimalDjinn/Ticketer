<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Integrations · Settings' })

const toast = useToast()
const { data: apps, refresh } = await useFetch<IntegrationAppDTO[]>('/api/integrations/apps', { default: () => [], deep: true })

const editOpen = ref(false)
const editing = ref<IntegrationAppDTO | null>(null)
const credentialsOpen = ref(false)
const credentials = ref<IntegrationAppCredentials | null>(null)
const rotated = ref(false)
const busy = ref<string | null>(null)
const confirm = ref<{ app: IntegrationAppDTO; action: 'rotate' | 'delete' } | null>(null)

function create() {
  editing.value = null
  editOpen.value = true
}
function edit(app: IntegrationAppDTO) {
  editing.value = app
  editOpen.value = true
}
function onCreated(result: IntegrationAppCredentials) {
  apps.value = [result.app, ...apps.value]
  credentials.value = result
  rotated.value = false
  credentialsOpen.value = true
}
function onSaved(app: IntegrationAppDTO) {
  apps.value = apps.value.map((a) => (a.id === app.id ? app : a))
}

async function setEnabled(app: IntegrationAppDTO, enabled: boolean) {
  busy.value = app.id
  try {
    onSaved(await $fetch<IntegrationAppDTO>(`/api/integrations/apps/${app.id}`, { method: 'PATCH', body: { enabled } }))
    toast.add({ color: 'success', title: enabled ? `${app.name} is on` : `${app.name} is off: its key and links stop working` })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e) })
  } finally {
    busy.value = null
  }
}

async function confirmed() {
  const pending = confirm.value
  if (!pending) return
  busy.value = pending.app.id
  try {
    if (pending.action === 'rotate') {
      const result = await $fetch<IntegrationAppCredentials>(`/api/integrations/apps/${pending.app.id}/rotate`, { method: 'POST' })
      onSaved(result.app)
      credentials.value = result
      rotated.value = true
      credentialsOpen.value = true
    } else {
      await $fetch(`/api/integrations/apps/${pending.app.id}`, { method: 'DELETE' })
      apps.value = apps.value.filter((a) => a.id !== pending.app.id)
      toast.add({ color: 'success', title: `${pending.app.name} deleted` })
    }
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e) })
    await refresh()
  } finally {
    busy.value = null
    confirm.value = null
  }
}

function menu(app: IntegrationAppDTO): DropdownMenuItem[][] {
  return [
    [
      { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => edit(app) },
      { label: 'Rotate key and secret', icon: 'i-lucide-refresh-cw', onSelect: () => (confirm.value = { app, action: 'rotate' }) },
      { label: app.enabled ? 'Turn off' : 'Turn on', icon: app.enabled ? 'i-lucide-pause' : 'i-lucide-play', onSelect: () => setEnabled(app, !app.enabled) },
    ],
    [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error', onSelect: () => (confirm.value = { app, action: 'delete' }) }],
  ]
}

const copiedId = ref<string | null>(null)
async function copyId(id: string) {
  await navigator.clipboard.writeText(id)
  copiedId.value = id
  setTimeout(() => (copiedId.value = null), 2000)
}

const confirmOpen = computed({
  get: () => !!confirm.value,
  set: (value) => {
    if (!value) confirm.value = null
  },
})
</script>

<template>
  <div class="mx-auto w-full max-w-4xl space-y-6">
    <section aria-labelledby="apps-heading" class="space-y-4">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1 space-y-1">
          <h2 id="apps-heading" class="font-semibold text-highlighted">Connected apps</h2>
          <p class="text-sm text-muted">
            Let another product send its users here: a “Report a problem” or “Contact support” button that signs them in and opens a ticket or a
            chat. Apps only ever sign in people outside the team.
          </p>
        </div>
        <UButton icon="i-lucide-plus" label="Connect an app" @click="create" />
      </div>

      <div v-if="!apps.length" class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-default px-6 py-10 text-center">
        <UIcon name="i-lucide-plug" class="size-8 text-dimmed" />
        <p class="font-medium text-highlighted">No apps yet</p>
        <p class="max-w-md text-sm text-muted">Connect an app to get an API key and a signing secret, then follow the instructions below.</p>
      </div>

      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="app in apps" :key="app.id" class="space-y-3 px-4 py-3" :class="{ 'opacity-70': !app.enabled }">
          <div class="flex flex-wrap items-start gap-x-3 gap-y-2">
            <UIcon name="i-lucide-app-window" class="mt-0.5 size-5 shrink-0 text-muted" />
            <div class="min-w-0 flex-1">
              <p class="flex flex-wrap items-center gap-2 font-medium text-highlighted">
                {{ app.name }}
                <UBadge v-if="!app.enabled" color="neutral" variant="subtle" size="sm" label="Off" icon="i-lucide-pause" />
                <UBadge color="neutral" variant="outline" size="sm" :icon="integrationLandingMeta[app.landing].icon" :label="integrationLandingMeta[app.landing].label" />
                <UBadge v-if="!app.canProvision" color="neutral" variant="outline" size="sm" label="Existing accounts only" />
                <UBadge v-if="app.canDelete" color="warning" variant="subtle" size="sm" icon="i-lucide-user-x" label="Can delete people" />
              </p>
              <p class="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
                <button type="button" class="inline-flex items-center gap-1 font-mono hover:text-default" :aria-label="`Copy the app ID of ${app.name}`" @click="copyId(app.id)">
                  {{ app.id }}
                  <UIcon :name="copiedId === app.id ? 'i-lucide-check' : 'i-lucide-copy'" class="size-3" />
                </button>
                <span>· key <span class="font-mono">{{ app.keyPrefix }}…</span></span>
                <span v-if="app.createdBy">· added by {{ app.createdBy }}</span>
                <span>· <NuxtTime :datetime="app.createdAt" relative /></span>
                <span v-if="app.rotatedAt">· rotated <NuxtTime :datetime="app.rotatedAt" relative /></span>
              </p>
              <p v-if="app.allowedOrigins.length" class="mt-0.5 truncate text-xs text-muted">Returns to {{ app.allowedOrigins.join(', ') }}</p>
            </div>
            <div class="flex items-center gap-1">
              <USwitch
                :model-value="app.enabled"
                :disabled="busy === app.id"
                :aria-label="app.enabled ? `Turn ${app.name} off` : `Turn ${app.name} on`"
                @update:model-value="(v) => setEnabled(app, v)"
              />
              <UDropdownMenu :items="menu(app)" :content="{ align: 'end' }">
                <UButton color="neutral" variant="ghost" icon="i-lucide-ellipsis" :aria-label="`Actions for ${app.name}`" :loading="busy === app.id" />
              </UDropdownMenu>
            </div>
          </div>
          <dl class="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
            <div class="rounded-md bg-elevated/50 px-2.5 py-1.5">
              <dt class="text-muted">Last used</dt>
              <dd class="font-medium text-highlighted">
                <NuxtTime v-if="app.lastUsedAt" :datetime="app.lastUsedAt" relative />
                <template v-else>Never</template>
              </dd>
            </div>
            <div class="rounded-md bg-elevated/50 px-2.5 py-1.5">
              <dt class="text-muted">API calls</dt>
              <dd class="font-medium text-highlighted tabular-nums">{{ app.apiCalls }}</dd>
            </div>
            <div class="rounded-md bg-elevated/50 px-2.5 py-1.5">
              <dt class="text-muted">Sign-ins</dt>
              <dd class="font-medium text-highlighted tabular-nums">{{ app.signIns }}</dd>
            </div>
            <div class="rounded-md bg-elevated/50 px-2.5 py-1.5">
              <dt class="text-muted">Tickets</dt>
              <dd class="font-medium text-highlighted tabular-nums">{{ app.ticketsCreated }}</dd>
            </div>
            <div class="rounded-md bg-elevated/50 px-2.5 py-1.5">
              <dt class="text-muted">People</dt>
              <dd class="font-medium text-highlighted tabular-nums">{{ app.people }}</dd>
            </div>
          </dl>
        </li>
      </ul>
    </section>

    <IntegrationsDocs :apps="apps" />

    <IntegrationsAppModal v-model:open="editOpen" :app="editing" @created="onCreated" @saved="onSaved" />
    <IntegrationsCredentialsModal v-model:open="credentialsOpen" :credentials="credentials" :rotated="rotated" />
    <UModal
      v-model:open="confirmOpen"
      :title="confirm?.action === 'rotate' ? `Rotate the credentials of ${confirm?.app.name}?` : `Delete ${confirm?.app.name}?`"
      :description="
        confirm?.action === 'rotate'
          ? 'The current API key and signing secret stop working immediately. Update the other app with the new ones.'
          : 'Its key and links stop working immediately. People and tickets it created stay.'
      "
    >
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton label="Cancel" color="neutral" variant="ghost" @click="confirm = null" />
          <UButton
            :label="confirm?.action === 'rotate' ? 'Rotate' : 'Delete'"
            :color="confirm?.action === 'rotate' ? 'warning' : 'error'"
            :loading="!!busy"
            @click="confirmed"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
