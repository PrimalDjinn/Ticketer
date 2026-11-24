<script setup lang="ts">
/** Settings → Bot protection: Cloudflare Turnstile or Google reCAPTCHA on the forms anyone can use without an account. */
definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Bot protection · Settings' })

type Source = 'env' | 'settings' | 'unset'
interface CaptchaView {
  provider: 'none' | CaptchaProvider
  siteKey: string
  secretKeySet: boolean
  sources: Record<'provider' | 'siteKey' | 'secretKey', Source>
  problem: string | null
  active: boolean
}

const toast = useToast()
const { refreshSite } = useSite()
const { data, refresh } = await useFetch<CaptchaView>('/api/settings/captcha')

const state = reactive({ provider: 'none' as CaptchaView['provider'], siteKey: '', secretKey: '' })
const clearSecret = ref(false)
watch(
  data,
  (value) => {
    if (value) Object.assign(state, { provider: value.provider, siteKey: value.siteKey, secretKey: '' })
    clearSecret.value = false
  },
  { immediate: true },
)
const locked = (field: 'provider' | 'siteKey' | 'secretKey') => data.value?.sources[field] === 'env'

const providers = [
  { value: 'none', label: 'Off', description: 'No check. Fine for private installs.' },
  { value: 'turnstile', label: 'Cloudflare Turnstile', description: 'Usually invisible; no puzzles. Free.' },
  { value: 'recaptcha', label: 'Google reCAPTCHA v2', description: 'The “I’m not a robot” checkbox.' },
]
const keyHelp = computed(() =>
  state.provider === 'turnstile'
    ? { text: 'Create a widget in the Cloudflare dashboard (Turnstile → Add widget) for this site’s hostname.', href: 'https://dash.cloudflare.com/?to=/:account/turnstile' }
    : state.provider === 'recaptcha'
      ? { text: 'Register this site in the reCAPTCHA admin console, choosing “Challenge (v2)” → “I’m not a robot” checkbox.', href: 'https://www.google.com/recaptcha/admin/create' }
      : null,
)

const saving = ref(false)
async function save() {
  saving.value = true
  try {
    await $fetch('/api/settings/captcha', {
      method: 'PUT',
      body: { provider: state.provider, siteKey: state.siteKey, secretKey: clearSecret.value ? null : state.secretKey || undefined },
    })
    await Promise.all([refresh(), refreshSite()])
    testResult.value = null
    toast.add({ title: 'Bot protection saved', color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save'), color: 'error' })
  } finally {
    saving.value = false
  }
}

// Try it: the widget with the saved site key, checked on the server with the saved secret key.
const savedConfig = computed(() => (data.value?.active && data.value.provider !== 'none' ? { provider: data.value.provider, siteKey: data.value.siteKey } : null))
const testToken = ref<string | null>(null)
const testWidget = useTemplateRef<{ reset(): void }>('testWidget')
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
async function runTest() {
  if (!testToken.value) return
  testing.value = true
  try {
    await $fetch('/api/settings/captcha/test', { method: 'POST', body: { token: testToken.value } })
    testResult.value = { ok: true, message: 'It works: the server verified the check with your secret key.' }
  } catch (e) {
    testResult.value = { ok: false, message: errorMessage(e, 'Verification failed') }
  } finally {
    testing.value = false
    testWidget.value?.reset()
  }
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">Bot protection</h1>
      <p class="text-sm text-muted">
        Asks for a quick “I’m not a robot” check on the forms anyone can use: creating an account without an invitation, resetting a password,
        and reporting an issue or starting a chat without signing in. People who are signed in never see it.
      </p>
    </div>

    <UAlert v-if="data.problem && data.provider !== 'none'" color="warning" variant="subtle" icon="i-lucide-shield-alert" title="Not active yet" :description="`${data.problem}. Until then, forms are not checked.`" />
    <UAlert v-else-if="data.active" color="success" variant="subtle" icon="i-lucide-shield-check" :title="`Protected by ${data.provider === 'turnstile' ? 'Cloudflare Turnstile' : 'Google reCAPTCHA'}`" />

    <form class="space-y-6" @submit.prevent="save">
      <UFormField label="Provider" name="provider" :help="locked('provider') ? 'Set by the NUXT_CAPTCHA_PROVIDER environment variable.' : undefined">
        <URadioGroup v-model="state.provider" :items="providers" :disabled="locked('provider')" variant="table" />
      </UFormField>

      <template v-if="state.provider !== 'none'">
        <p v-if="keyHelp" class="text-sm text-muted">
          {{ keyHelp.text }}
          <ULink :to="keyHelp.href" target="_blank" class="text-primary">Open it</ULink>
        </p>
        <div class="grid gap-4 sm:grid-cols-2">
          <UFormField label="Site key" name="siteKey" :help="locked('siteKey') ? 'Set by NUXT_CAPTCHA_SITE_KEY.' : 'Public; shown to browsers.'">
            <UInput v-model="state.siteKey" autocomplete="off" class="w-full font-mono" :disabled="locked('siteKey')" />
          </UFormField>
          <UFormField
            label="Secret key"
            name="secretKey"
            :help="locked('secretKey') ? 'Set by NUXT_CAPTCHA_SECRET_KEY.' : data.secretKeySet && !clearSecret ? 'Saved. Leave empty to keep it.' : 'Kept on the server, encrypted.'"
          >
            <UInput
              v-model="state.secretKey"
              type="password"
              autocomplete="new-password"
              class="w-full font-mono"
              :placeholder="data.secretKeySet && !clearSecret ? '••••••••' : ''"
              :disabled="locked('secretKey') || clearSecret"
            />
          </UFormField>
        </div>
        <UCheckbox v-if="data.secretKeySet && !locked('secretKey')" v-model="clearSecret" label="Remove the saved secret key" />
      </template>

      <div class="flex justify-end">
        <UButton type="submit" label="Save" :loading="saving" />
      </div>
    </form>

    <section v-if="savedConfig" class="space-y-3 rounded-lg border border-default p-4">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">Try it</h2>
        <p class="text-sm text-muted">Complete the check, then verify it. This proves the saved site key and secret key belong together. Save first if you changed them.</p>
      </div>
      <CaptchaWidget ref="testWidget" v-model="testToken" :config="savedConfig" />
      <UButton label="Verify" icon="i-lucide-shield-check" color="neutral" variant="outline" :loading="testing" :disabled="!testToken" @click="runTest" />
      <UAlert v-if="testResult" :color="testResult.ok ? 'success' : 'error'" variant="subtle" :icon="testResult.ok ? 'i-lucide-check' : 'i-lucide-circle-alert'" :title="testResult.message" />
    </section>
  </div>
</template>
