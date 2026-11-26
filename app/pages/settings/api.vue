<script setup lang="ts">
/** Settings → API: whether personal access tokens may be used, and every token on this Ticketer. See docs/admin/api.md. */
definePageMeta({ middleware: ['auth', 'admin'] })

interface AdminTokenView {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt: string | null
  lastUsedAt: string | null
  createdAt: string
  owner: { id: string; name: string }
}

const toast = useToast()
const { data, refresh } = await useFetch<{ enabled: boolean; tokens: AdminTokenView[] }>('/api/settings/api', { default: () => ({ enabled: true, tokens: [] }) })

async function setEnabled(enabled: boolean) {
  if (!enabled && data.value?.tokens.length && !confirm('Turn off access tokens? Every existing token stops working until you turn them on again.')) return
  try {
    await $fetch('/api/settings/api', { method: 'PUT', body: { enabled } })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
async function revoke(token: AdminTokenView) {
  if (!confirm(`Revoke ${token.owner.name}'s token “${token.name}”? Anything using it stops working at once.`)) return
  try {
    await $fetch(`/api/settings/api/tokens/${token.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">API</h1>
      <p class="max-w-2xl text-sm text-muted">
        People on the team can create access tokens under Account to use the
        <ULink to="https://primaldjinn.github.io/Ticketer/integrate/api" target="_blank" class="text-primary">Ticketer API</ULink>
        from scripts and other tools. A token can only do what its owner can, within the scopes it was given. The API's description is at
        <ULink to="/api/v1/openapi.json" target="_blank" external class="font-mono text-xs text-primary">/api/v1/openapi.json</ULink>.
      </p>
    </div>

    <div class="flex items-start justify-between gap-4 rounded-lg border border-default px-4 py-3">
      <div>
        <p class="text-sm font-medium text-highlighted">Allow access tokens</p>
        <p class="text-sm text-muted">Off: nobody can create tokens, and existing ones stop working until this is on again.</p>
      </div>
      <USwitch :model-value="data.enabled" aria-label="Allow access tokens" @update:model-value="setEnabled" />
    </div>

    <section class="space-y-3">
      <h2 class="text-sm font-semibold text-highlighted">Tokens</h2>
      <p v-if="!data.tokens.length" class="text-sm text-muted">Nobody has created a token yet.</p>
      <ul v-else class="divide-y divide-default rounded-lg border border-default">
        <li v-for="t in data.tokens" :key="t.id" class="flex flex-wrap items-center gap-3 px-4 py-3">
          <UAvatar :text="initials(t.owner.name)" size="sm" />
          <div class="min-w-0 flex-1">
            <p class="text-sm font-medium text-highlighted">{{ t.name }} <span class="font-normal text-muted">· {{ t.owner.name }}</span></p>
            <p class="text-xs text-dimmed">
              <span class="font-mono">{{ t.prefix }}…</span> · {{ t.scopes.join(', ') }} · {{ t.lastUsedAt ? 'used' : 'never used' }}<template v-if="t.lastUsedAt"> <NuxtTime :datetime="t.lastUsedAt" relative /></template>
            </p>
          </div>
          <UButton label="Revoke" color="error" variant="ghost" size="sm" @click="revoke(t)" />
        </li>
      </ul>
    </section>
  </div>
</template>
