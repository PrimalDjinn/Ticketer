<script setup lang="ts">
/** The API key and signing secret, shown once after creating an app or rotating its credentials. */
const open = defineModel<boolean>('open', { default: false })
defineProps<{ credentials: IntegrationAppCredentials | null; rotated?: boolean }>()

const copied = ref<'key' | 'secret' | null>(null)
async function copy(which: 'key' | 'secret', value: string) {
  await navigator.clipboard.writeText(value)
  copied.value = which
  setTimeout(() => (copied.value = null), 2000)
}
</script>

<template>
  <UModal v-model:open="open" :title="rotated ? 'New credentials' : 'App connected'" :dismissible="false">
    <template #body>
      <div v-if="credentials" class="space-y-4">
        <UAlert
          color="warning"
          variant="subtle"
          icon="i-lucide-key-round"
          title="Copy these now. They are not shown again."
          :description="rotated ? 'The previous key and secret stopped working.' : 'Store them in the other app\'s server configuration, never in a browser.'"
        />
        <UFormField label="App ID" help="Public: goes into signed links as app=…">
          <UInput :model-value="credentials.app.id" readonly class="w-full font-mono text-xs" aria-label="App ID" />
        </UFormField>
        <UFormField label="API key" help="Server-to-server calls: Authorization: Bearer <key>.">
          <div class="flex gap-2">
            <UInput :model-value="credentials.apiKey" readonly class="w-full font-mono text-xs" aria-label="API key" @focus="($event.target as HTMLInputElement).select()" />
            <UButton :icon="copied === 'key' ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied === 'key' ? 'Copied' : 'Copy'" color="neutral" variant="outline" @click="copy('key', credentials.apiKey)" />
          </div>
        </UFormField>
        <UFormField label="Signing secret" help="Signs browser launch links (HMAC-SHA256).">
          <div class="flex gap-2">
            <UInput :model-value="credentials.signingSecret" readonly class="w-full font-mono text-xs" aria-label="Signing secret" @focus="($event.target as HTMLInputElement).select()" />
            <UButton
              :icon="copied === 'secret' ? 'i-lucide-check' : 'i-lucide-copy'"
              :label="copied === 'secret' ? 'Copied' : 'Copy'"
              color="neutral"
              variant="outline"
              @click="copy('secret', credentials.signingSecret)"
            />
          </div>
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex w-full justify-end">
        <UButton label="I have copied them" @click="open = false" />
      </div>
    </template>
  </UModal>
</template>
