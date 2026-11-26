<script setup lang="ts">
/** Account → Access tokens: personal access tokens for the public API (docs/integrate/api.md). Team only. */
interface TokenView {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
}

const toast = useToast()
const { data, refresh } = await useFetch<{ enabled: boolean; tokens: TokenView[] }>('/api/account/tokens', { default: () => ({ enabled: true, tokens: [] }) })

const SCOPE_GROUPS = [
  { label: 'Tickets', read: 'tickets:read', write: 'tickets:write' },
  { label: 'Internal notes', read: 'notes:read', write: 'notes:write' },
  { label: 'Support chats', read: 'conversations:read', write: 'conversations:write' },
  { label: 'Projects', read: 'projects:read', write: null },
  { label: 'Tasks', read: 'tasks:read', write: 'tasks:write' },
  { label: 'People (names and email addresses)', read: 'people:read', write: null },
] as const
const EXPIRY = [
  { label: '30 days', value: 30 },
  { label: '90 days', value: 90 },
  { label: '1 year', value: 366 },
  { label: 'Never', value: 0 },
]

const open = ref(false)
const draft = reactive({ name: '', scopes: ['tickets:read'] as string[], expires: 90 })
const creating = ref(false)
const created = ref<string | null>(null)

function toggle(scope: string, on: boolean) {
  draft.scopes = on ? [...new Set([...draft.scopes, scope])] : draft.scopes.filter((s) => s !== scope)
}
async function create() {
  creating.value = true
  try {
    const result = await $fetch<{ token: string }>('/api/account/tokens', {
      method: 'POST',
      body: { name: draft.name, scopes: draft.scopes, expiresInDays: draft.expires || null },
    })
    created.value = result.token
    open.value = false
    Object.assign(draft, { name: '', scopes: ['tickets:read'], expires: 90 })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not create the token'), color: 'error' })
  } finally {
    creating.value = false
  }
}
async function revoke(token: TokenView) {
  if (!confirm(`Revoke “${token.name}”? Anything using it stops working at once.`)) return
  try {
    await $fetch(`/api/account/tokens/${token.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied', icon: 'i-lucide-copy-check' })
}
const expired = (t: TokenView) => !!t.expiresAt && new Date(t.expiresAt) < new Date()
</script>

<template>
  <section v-if="data" class="space-y-4">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 class="font-semibold text-highlighted">Access tokens</h2>
        <p class="mt-1 max-w-xl text-sm text-muted">
          Let scripts and other tools use Ticketer's API as you. A token can only do what you can do, and only what its scopes allow.
          <ULink to="https://primaldjinn.github.io/Ticketer/integrate/api" target="_blank" class="text-primary">How to use the API</ULink>
        </p>
      </div>
      <UButton v-if="data.enabled" icon="i-lucide-plus" label="Create token" color="neutral" variant="outline" @click="open = true" />
    </div>
    <UAlert v-if="!data.enabled" color="neutral" variant="subtle" icon="i-lucide-ban" title="An admin has turned off access tokens on this Ticketer." />

    <ul v-if="data.tokens.length" class="divide-y divide-default rounded-lg border border-default">
      <li v-for="t in data.tokens" :key="t.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
        <div class="min-w-0 flex-1">
          <p class="flex items-center gap-2 text-sm font-medium text-highlighted">
            {{ t.name }}
            <UBadge v-if="expired(t)" label="Expired" color="neutral" variant="subtle" size="sm" />
          </p>
          <p class="font-mono text-xs text-muted">{{ t.prefix }}…</p>
          <p class="text-xs text-dimmed">
            {{ t.scopes.join(', ') }}
            · {{ t.lastUsedAt ? 'used' : 'never used' }}<template v-if="t.lastUsedAt"> <NuxtTime :datetime="t.lastUsedAt" relative /></template>
            · {{ t.expiresAt ? (expired(t) ? 'expired' : 'expires') : 'never expires' }}<template v-if="t.expiresAt"> <NuxtTime :datetime="t.expiresAt" relative /></template>
          </p>
        </div>
        <UButton label="Revoke" color="error" variant="ghost" size="sm" @click="revoke(t)" />
      </li>
    </ul>

    <UModal v-model:open="open" title="Create an access token">
      <template #body>
        <form id="token-form" class="space-y-4" @submit.prevent="create">
          <UFormField label="Name" required help="What uses it, so you can tell tokens apart.">
            <UInput v-model="draft.name" placeholder="Nightly report script" maxlength="80" class="w-full" />
          </UFormField>
          <!-- A fieldset, not UFormField: UFormField gives every checkbox inside it the same id and label. -->
          <fieldset class="space-y-1.5">
            <legend class="text-sm font-medium text-default">Scopes</legend>
            <p class="text-sm text-muted">Give only what the tool needs.</p>
            <div class="divide-y divide-default rounded-md border border-default">
              <div v-for="g in SCOPE_GROUPS" :key="g.read" class="flex items-center gap-4 px-3 py-2 text-sm">
                <span class="flex-1">{{ g.label }}</span>
                <UCheckbox :model-value="draft.scopes.includes(g.read)" label="Read" :aria-label="`${g.label}: read`" @update:model-value="(v) => toggle(g.read, !!v)" />
                <UCheckbox v-if="g.write" :model-value="draft.scopes.includes(g.write)" label="Change" :aria-label="`${g.label}: change`" @update:model-value="(v) => toggle(g.write!, !!v)" />
                <span v-else class="w-[4.5rem]" />
              </div>
            </div>
          </fieldset>
          <UFormField label="Expires">
            <USelect v-model="draft.expires" :items="EXPIRY" class="w-40" />
          </UFormField>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="open = false" />
          <UButton type="submit" form="token-form" label="Create token" :loading="creating" :disabled="!draft.name.trim() || !draft.scopes.length" />
        </div>
      </template>
    </UModal>

    <UModal :open="!!created" title="Your new token" :dismissible="false" @update:open="(v) => !v && (created = null)">
      <template #body>
        <div class="space-y-3 text-sm">
          <p>Copy it now: it won't be shown again. Keep it secret, like a password.</p>
          <div class="flex items-center gap-2 rounded-md border border-default bg-elevated/50 p-2">
            <code class="min-w-0 flex-1 font-mono text-xs break-all">{{ created }}</code>
            <UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy the token" @click="copy(created!)" />
          </div>
          <p class="text-muted">Send it as <code class="font-mono text-xs">Authorization: Bearer &lt;token&gt;</code> to <code class="font-mono text-xs">/api/v1/…</code>.</p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="I have copied it" @click="created = null" />
        </div>
      </template>
    </UModal>
  </section>
</template>
