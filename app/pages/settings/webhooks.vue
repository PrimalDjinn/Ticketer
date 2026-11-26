<script setup lang="ts">
/** Settings → Webhooks: addresses Ticketer sends signed events to. See docs/admin/webhooks.md. */
definePageMeta({ middleware: ['auth', 'admin'] })

interface WebhookView {
  id: string
  name: string
  url: string
  events: string[]
  includeNotes: boolean
  includeEmails: boolean
  enabled: boolean
  disabledReason: string | null
  failingSince: string | null
  lastSuccessAt: string | null
  createdAt: string
  pending: number
}
interface DeliveryView {
  id: string
  eventId: string
  eventType: string
  status: 'pending' | 'success' | 'failed'
  attempts: number
  nextAttemptAt: string | null
  responseStatus: number | null
  responseMs: number | null
  responseExcerpt: string | null
  createdAt: string
}

const toast = useToast()
const { data, refresh } = await useFetch<{ events: string[]; allowPrivateNetwork: boolean; webhooks: WebhookView[] }>('/api/settings/webhooks', {
  default: () => ({ events: [], allowPrivateNetwork: false, webhooks: [] }),
})

// --- create and edit ------------------------------------------------------------------------------------------------
const editing = ref<WebhookView | null>(null)
const formOpen = ref(false)
const draft = ref({ name: '', url: '', all: true, events: [] as string[], includeNotes: false, includeEmails: false })
const saving = ref(false)
const secret = ref<{ name: string; value: string } | null>(null)

function openCreate() {
  editing.value = null
  Object.assign(draft.value, { name: '', url: '', all: true, events: [], includeNotes: false, includeEmails: false })
  formOpen.value = true
}
function openEdit(hook: WebhookView) {
  editing.value = hook
  const all = hook.events.includes('*')
  Object.assign(draft.value, { name: hook.name, url: hook.url, all, events: all ? [] : [...hook.events], includeNotes: hook.includeNotes, includeEmails: hook.includeEmails })
  formOpen.value = true
}
const eventGroups = computed(() => {
  const groups = new Map<string, string[]>()
  for (const type of data.value?.events ?? []) {
    const area = type.split('.')[0]!
    groups.set(area, [...(groups.get(area) ?? []), type])
  }
  return [...groups.entries()].map(([area, types]) => ({ area: { ticket: 'Tickets', conversation: 'Support chats', project: 'Projects', task: 'Tasks' }[area] ?? area, types }))
})
function toggleEvent(type: string, on: boolean) {
  draft.value.events = on ? [...new Set([...draft.value.events, type])] : draft.value.events.filter((t) => t !== type)
}

async function save() {
  saving.value = true
  const body = { name: draft.value.name, url: draft.value.url, events: draft.value.all ? ['*'] : draft.value.events, includeNotes: draft.value.includeNotes, includeEmails: draft.value.includeEmails }
  try {
    if (editing.value) {
      await $fetch(`/api/settings/webhooks/${editing.value.id}`, { method: 'PATCH', body })
      toast.add({ title: 'Webhook saved', color: 'success' })
    } else {
      const created = await $fetch<{ webhook: WebhookView; secret: string }>('/api/settings/webhooks', { method: 'POST', body })
      secret.value = { name: created.webhook.name, value: created.secret }
    }
    formOpen.value = false
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save the webhook'), color: 'error' })
  } finally {
    saving.value = false
  }
}

// --- actions --------------------------------------------------------------------------------------------------------
async function setEnabled(hook: WebhookView, enabled: boolean) {
  try {
    await $fetch(`/api/settings/webhooks/${hook.id}`, { method: 'PATCH', body: { enabled } })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
const testing = ref<string | null>(null)
async function test(hook: WebhookView) {
  testing.value = hook.id
  try {
    const result = await $fetch<{ ok: boolean; status: number | null; ms: number; excerpt: string }>(`/api/settings/webhooks/${hook.id}/test`, { method: 'POST' })
    if (result.ok) toast.add({ title: `The receiver answered ${result.status} in ${result.ms} ms`, color: 'success', icon: 'i-lucide-circle-check' })
    else toast.add({ title: result.status ? `The receiver answered ${result.status}` : 'Not delivered', description: result.excerpt.slice(0, 200), color: 'error' })
    if (deliveriesFor.value?.id === hook.id) await loadDeliveries(hook)
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    testing.value = null
  }
}
async function rotate(hook: WebhookView) {
  if (!confirm(`Replace the signing secret of “${hook.name}”? The old one stops working at once.`)) return
  try {
    const result = await $fetch<{ secret: string }>(`/api/settings/webhooks/${hook.id}/rotate`, { method: 'POST' })
    secret.value = { name: hook.name, value: result.secret }
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
async function remove(hook: WebhookView) {
  if (!confirm(`Delete the webhook “${hook.name}”? Nothing more is sent to it.`)) return
  try {
    await $fetch(`/api/settings/webhooks/${hook.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}
const actions = (hook: WebhookView) => [
  [
    { label: 'Edit', icon: 'i-lucide-pencil', onSelect: () => openEdit(hook) },
    { label: 'Send a test event', icon: 'i-lucide-send', onSelect: () => test(hook) },
    { label: 'Deliveries', icon: 'i-lucide-list', onSelect: () => loadDeliveries(hook) },
  ],
  [{ label: 'Rotate secret', icon: 'i-lucide-refresh-cw', onSelect: () => rotate(hook) }],
  [{ label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => remove(hook) }],
]

// --- deliveries -----------------------------------------------------------------------------------------------------
const deliveriesFor = ref<WebhookView | null>(null)
const deliveries = ref<DeliveryView[]>([])
const deliveriesOpen = computed({ get: () => !!deliveriesFor.value, set: (v) => !v && (deliveriesFor.value = null) })
async function loadDeliveries(hook: WebhookView) {
  deliveriesFor.value = hook
  deliveries.value = await $fetch<DeliveryView[]>(`/api/settings/webhooks/${hook.id}/deliveries`)
}
const redelivering = ref<string | null>(null)
async function redeliver(delivery: DeliveryView) {
  redelivering.value = delivery.id
  try {
    const result = await $fetch<DeliveryView>(`/api/settings/webhooks/deliveries/${delivery.id}/redeliver`, { method: 'POST' })
    toast.add({ title: result.status === 'success' ? 'Delivered' : `Still failing (${result.responseStatus ?? 'no answer'})`, color: result.status === 'success' ? 'success' : 'error' })
    await loadDeliveries(deliveriesFor.value!)
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    redelivering.value = null
  }
}
const DELIVERY_STATUS = {
  success: { label: 'Delivered', color: 'success' as const },
  pending: { label: 'Retrying', color: 'warning' as const },
  failed: { label: 'Failed', color: 'error' as const },
}
const deliveryLabel = (status: DeliveryView['status']) => DELIVERY_STATUS[status].label
const deliveryColor = (status: DeliveryView['status']) => DELIVERY_STATUS[status].color

async function copy(text: string) {
  await navigator.clipboard.writeText(text)
  toast.add({ title: 'Copied', icon: 'i-lucide-copy-check' })
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 class="text-lg font-semibold text-highlighted">Webhooks</h1>
        <p class="max-w-2xl text-sm text-muted">
          Ticketer sends a signed request to these addresses when tickets, chats, projects or tasks change, so other tools (n8n, Zapier, your own code) can
          react. Requests follow the <ULink to="https://www.standardwebhooks.com" target="_blank" class="text-primary">Standard Webhooks</ULink> format.
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Add webhook" @click="openCreate" />
    </div>

    <UEmpty v-if="!data.webhooks.length" icon="i-lucide-webhook" title="No webhooks yet" description="Add one to send events to another tool." />

    <ul v-else class="divide-y divide-default rounded-lg border border-default">
      <li v-for="hook in data.webhooks" :key="hook.id" class="flex flex-wrap items-center gap-4 px-4 py-3.5">
        <div class="min-w-0 flex-1">
          <p class="flex flex-wrap items-center gap-2 text-sm font-medium text-highlighted">
            {{ hook.name }}
            <UBadge v-if="!hook.enabled" :label="hook.disabledReason ? 'Turned off by Ticketer' : 'Off'" color="neutral" variant="subtle" size="sm" />
            <UBadge v-else-if="hook.failingSince" label="Failing" color="error" variant="subtle" size="sm" />
            <UBadge v-if="hook.includeNotes" label="Internal notes" color="warning" variant="subtle" size="sm" icon="i-lucide-lock" />
            <UBadge v-if="hook.includeEmails" label="Email addresses" color="warning" variant="subtle" size="sm" />
          </p>
          <p class="truncate font-mono text-xs text-muted">{{ hook.url }}</p>
          <p class="text-xs text-dimmed">
            {{ hook.events.includes('*') ? 'All events' : `${hook.events.length} ${hook.events.length === 1 ? 'event' : 'events'}` }}
            <template v-if="hook.lastSuccessAt"> · last delivered <NuxtTime :datetime="hook.lastSuccessAt" relative /></template>
            <template v-if="hook.pending"> · {{ hook.pending }} waiting to retry</template>
          </p>
          <p v-if="hook.disabledReason" class="text-xs text-error">{{ hook.disabledReason }}. Fix the receiver, then turn the webhook on again.</p>
        </div>
        <USwitch :model-value="hook.enabled" :aria-label="`Send to ${hook.name}`" @update:model-value="(v) => setEnabled(hook, v)" />
        <UButton icon="i-lucide-send" color="neutral" variant="ghost" :loading="testing === hook.id" :aria-label="`Send a test event to ${hook.name}`" @click="test(hook)" />
        <UDropdownMenu :items="actions(hook)" :content="{ align: 'end' }">
          <UButton icon="i-lucide-ellipsis-vertical" color="neutral" variant="ghost" :aria-label="`Actions for ${hook.name}`" />
        </UDropdownMenu>
      </li>
    </ul>

    <UAlert
      v-if="data.allowPrivateNetwork"
      color="warning"
      variant="subtle"
      icon="i-lucide-network"
      title="Private addresses are allowed"
      description="NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK is on, so webhooks may reach hosts on this server's network and plain http:// addresses."
    />

    <!-- Create / edit -->
    <UModal v-model:open="formOpen" :title="editing ? `Edit ${editing.name}` : 'Add a webhook'">
      <template #body>
        <form id="webhook-form" class="space-y-4" @submit.prevent="save">
          <UFormField label="Name" required>
            <UInput v-model="draft.name" placeholder="n8n" class="w-full" maxlength="80" />
          </UFormField>
          <UFormField label="Address" required help="Ticketer sends a POST with a JSON body. It must answer 2xx within 10 seconds.">
            <UInput v-model="draft.url" type="url" placeholder="https://n8n.example.com/webhook/ticketer" class="w-full" />
          </UFormField>
          <UFormField label="Events">
            <div class="space-y-3">
              <UCheckbox v-model="draft.all" label="All events, including ones added later" />
              <div v-if="!draft.all" class="grid gap-3 sm:grid-cols-2">
                <div v-for="group in eventGroups" :key="group.area" class="space-y-1.5">
                  <p class="text-xs font-medium text-muted">{{ group.area }}</p>
                  <UCheckbox
                    v-for="type in group.types"
                    :key="type"
                    :model-value="draft.events.includes(type)"
                    :label="type"
                    :ui="{ label: 'font-mono text-xs' }"
                    @update:model-value="(v) => toggleEvent(type, !!v)"
                  />
                </div>
              </div>
            </div>
          </UFormField>
          <div class="space-y-2 rounded-md border border-default p-3">
            <UCheckbox v-model="draft.includeNotes" label="Send internal notes" description="Notes on tickets and chats that only the team sees. Off: they're never sent here." />
            <UCheckbox v-model="draft.includeEmails" label="Send email addresses" description="Off: email addresses are removed from every event." />
          </div>
        </form>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Cancel" @click="formOpen = false" />
          <UButton type="submit" form="webhook-form" :label="editing ? 'Save' : 'Add webhook'" :loading="saving" :disabled="!draft.name || !draft.url || (!draft.all && !draft.events.length)" />
        </div>
      </template>
    </UModal>

    <!-- The secret, once -->
    <UModal :open="!!secret" title="Signing secret" :dismissible="false" @update:open="(v) => !v && (secret = null)">
      <template #body>
        <div class="space-y-3 text-sm">
          <p>
            Copy the secret for <strong>{{ secret?.name }}</strong> into the receiving tool. It verifies that requests come from Ticketer. It won't be shown again.
          </p>
          <div class="flex items-center gap-2 rounded-md border border-default bg-elevated/50 p-2">
            <code class="min-w-0 flex-1 font-mono text-xs break-all">{{ secret?.value }}</code>
            <UButton icon="i-lucide-copy" color="neutral" variant="ghost" aria-label="Copy the secret" @click="copy(secret!.value)" />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton label="I have copied it" @click="secret = null" />
        </div>
      </template>
    </UModal>

    <!-- Deliveries -->
    <USlideover v-model:open="deliveriesOpen" :title="`Deliveries to ${deliveriesFor?.name ?? ''}`" description="The last 50, kept for 7 days.">
      <template #body>
        <p v-if="!deliveries.length" class="text-sm text-muted">Nothing sent yet.</p>
        <ul class="space-y-2">
          <li v-for="d in deliveries" :key="d.id" class="rounded-md border border-default p-3 text-sm">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge :label="deliveryLabel(d.status)" :color="deliveryColor(d.status)" variant="subtle" size="sm" />
              <span class="font-mono text-xs">{{ d.eventType }}</span>
              <span class="ms-auto text-xs text-muted"><NuxtTime :datetime="d.createdAt" relative /></span>
            </div>
            <p class="mt-1 text-xs text-muted">
              {{ d.responseStatus ? `Answered ${d.responseStatus}` : 'No answer' }}<template v-if="d.responseMs !== null"> in {{ d.responseMs }} ms</template> ·
              {{ d.attempts }} {{ d.attempts === 1 ? 'attempt' : 'attempts' }}
              <template v-if="d.status === 'pending' && d.nextAttemptAt"> · next <NuxtTime :datetime="d.nextAttemptAt" relative /></template>
            </p>
            <pre v-if="d.responseExcerpt" class="mt-2 max-h-24 overflow-auto rounded bg-elevated p-2 text-xs whitespace-pre-wrap">{{ d.responseExcerpt }}</pre>
            <UButton
              v-if="d.eventType !== 'webhook.test' && d.status !== 'success'"
              size="xs"
              color="neutral"
              variant="outline"
              icon="i-lucide-rotate-cw"
              label="Redeliver"
              class="mt-2"
              :loading="redelivering === d.id"
              @click="redeliver(d)"
            />
          </li>
        </ul>
      </template>
    </USlideover>
  </div>
</template>
