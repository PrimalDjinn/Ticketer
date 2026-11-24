<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

/** Create an app (emits its one-time credentials) or edit one. */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ app?: IntegrationAppDTO | null }>()
const emit = defineEmits<{ created: [result: IntegrationAppCredentials]; saved: [app: IntegrationAppDTO] }>()
const toast = useToast()

const schema = z.object({
  name: z.string().trim().min(1, 'Name the app').max(80),
  origins: z.string().max(5000),
  landing: z.enum(INTEGRATION_LANDINGS),
  canProvision: z.boolean(),
  canDelete: z.boolean(),
})
type Schema = z.output<typeof schema>
const landingSchema = z.enum(INTEGRATION_LANDINGS)

// A ref, not reactive(): vue-tsc 3.3 mis-types reactive objects used in narrowing template expressions.
const state = ref<Schema>({ name: '', origins: '', landing: 'new-ticket', canProvision: true, canDelete: false })
function setLanding(value: unknown) {
  state.value.landing = landingSchema.parse(value)
}
const loading = ref(false)

watch(open, (value) => {
  if (!value) return
  Object.assign(state.value, {
    name: props.app?.name ?? '',
    origins: props.app?.allowedOrigins.join('\n') ?? '',
    landing: props.app?.landing ?? 'new-ticket',
    canProvision: props.app?.canProvision ?? true,
    canDelete: props.app?.canDelete ?? false,
  })
})

const landingOptions = INTEGRATION_LANDINGS.map((value) => ({ value, ...integrationLandingMeta[value] }))

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  const body = {
    name: event.data.name,
    allowedOrigins: event.data.origins.split(/[\s,]+/).filter(Boolean),
    landing: event.data.landing,
    canProvision: event.data.canProvision,
    canDelete: event.data.canDelete,
  }
  try {
    if (props.app) {
      emit('saved', await $fetch<IntegrationAppDTO>(`/api/integrations/apps/${props.app.id}`, { method: 'PATCH', body }))
      toast.add({ color: 'success', title: `${body.name} saved` })
    } else {
      emit('created', await $fetch<IntegrationAppCredentials>('/api/integrations/apps', { method: 'POST', body }))
    }
    open.value = false
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not save the app') })
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <UModal v-model:open="open" :title="app ? `Edit ${app.name}` : 'Connect an app'" :description="app ? undefined : 'Another product that sends its users here to report problems or chat with support.'">
    <template #body>
      <UForm id="integration-app-form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Name" name="name" help="Shown to people as “Back to …” and on tickets as “Reported from …”.">
          <UInput v-model="state.name" placeholder="Billing portal" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Allowed return origins" name="origins" :help="'One per line, e.g. https://app.example.com. A returnUrl must start with one of these; leave empty for no back link.'">
          <UTextarea v-model="state.origins" :rows="2" :placeholder="'https://app.example.com'" class="w-full font-mono text-xs" autoresize />
        </UFormField>
        <UFormField label="Landing page" name="landing" help="Where people arrive when the request does not ask for something else.">
          <USelect
            :model-value="state.landing"
            :items="landingOptions"
            class="w-full"
            :ui="{ content: 'min-w-80' }"
            aria-label="Landing page"
            @update:model-value="setLanding"
          />
        </UFormField>
        <div class="flex items-center justify-between gap-4 rounded-md bg-elevated/50 px-3 py-2.5">
          <div>
            <p class="text-sm font-medium text-highlighted">May create accounts</p>
            <p class="text-xs text-muted">People without an account get one (always as external). Off: only existing external accounts.</p>
          </div>
          <USwitch v-model="state.canProvision" aria-label="May create accounts" />
        </div>
        <div class="flex items-center justify-between gap-4 rounded-md bg-elevated/50 px-3 py-2.5">
          <div>
            <p class="text-sm font-medium text-highlighted">Can delete people</p>
            <p class="text-xs text-muted">Lets the app erase accounts of external people it brought here, for data-deletion requests. Never team members.</p>
          </div>
          <USwitch v-model="state.canDelete" aria-label="Can delete people" />
        </div>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
        <UButton type="submit" form="integration-app-form" :label="app ? 'Save' : 'Create app'" :icon="app ? 'i-lucide-save' : 'i-lucide-plus'" :loading="loading" />
      </div>
    </template>
  </UModal>
</template>
