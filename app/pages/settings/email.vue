<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

/** Settings → Email: sender address and (on Node) the SMTP server. Environment variables win and lock fields. */
definePageMeta({ middleware: ['auth', 'admin'] })

type Source = 'env' | 'settings' | 'unset'
interface MailSettingsView {
  platform: 'cloudflare' | 'node'
  transport: 'cloudflare' | 'smtp' | 'none'
  from: { value: string; source: Source }
  smtp: { source: Source; host: string; port: number; security: 'tls' | 'starttls' | 'none'; user: string; passwordSet: boolean }
}

const toast = useToast()
const { user } = useUserSession()
const { data, refresh } = await useFetch<MailSettingsView>('/api/settings/mail')

const schema = z.object({
  from: z.string().trim().max(200),
  host: z.string().trim().max(253),
  port: z.number({ error: 'Enter a port' }).int().min(1).max(65535),
  security: z.enum(['tls', 'starttls', 'none']),
  user: z.string().trim().max(320),
  password: z.string().max(2000),
})
type Schema = z.output<typeof schema>

const state = reactive<Schema>({ from: '', host: '', port: 587, security: 'starttls', user: '', password: '' })
const clearPassword = ref(false)
watch(
  data,
  (value) => {
    if (!value) return
    Object.assign(state, {
      from: value.from.value,
      host: value.smtp.host,
      port: value.smtp.port,
      security: value.smtp.security,
      user: value.smtp.user,
      password: '',
    })
    clearPassword.value = false
  },
  { immediate: true },
)

const fromLocked = computed(() => data.value?.from.source === 'env')
const smtpLocked = computed(() => data.value?.smtp.source === 'env')
const onCloudflare = computed(() => data.value?.platform === 'cloudflare')

const securityOptions = [
  { value: 'starttls', label: 'STARTTLS', description: 'Usually port 587' },
  { value: 'tls', label: 'TLS', description: 'Usually port 465' },
  { value: 'none', label: 'None', description: 'Unencrypted; local relays only' },
]
// Suggest the matching port when switching security, unless a custom port was typed.
watch(
  () => state.security,
  (security, previous) => {
    const defaults: Record<string, number> = { tls: 465, starttls: 587, none: 25 }
    if (previous && state.port === defaults[previous]) state.port = defaults[security]!
  },
)

const status = computed(() => {
  const d = data.value
  if (!d) return null
  if (d.transport === 'none' || !d.from.value) {
    return {
      color: 'warning' as const,
      icon: 'i-lucide-mail-x',
      title: 'Email is not sending',
      description: d.platform === 'cloudflare'
        ? 'Add the EMAIL send_email binding and onboard your domain to Cloudflare Email Sending, then set a sender address. Until then, invitation and reset links are written to the logs.'
        : 'Set a sender address and an SMTP server. Until then, invitation and reset links are written to the server log.',
    }
  }
  return {
    color: 'success' as const,
    icon: 'i-lucide-mail-check',
    title: d.transport === 'cloudflare' ? 'Sending through Cloudflare Email Sending' : `Sending through ${d.smtp.host || 'SMTP'}`,
    description: `Messages come from ${d.from.value}.`,
  }
})

const saving = ref(false)
async function onSubmit(event: FormSubmitEvent<Schema>) {
  saving.value = true
  try {
    const { password, ...rest } = event.data
    await $fetch('/api/settings/mail', {
      method: 'PUT',
      body: { ...rest, password: clearPassword.value ? null : password ? password : undefined },
    })
    toast.add({ title: 'Email settings saved', color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not save'), color: 'error' })
  } finally {
    saving.value = false
  }
}

const testTo = ref(user.value?.email ?? '')
const testing = ref(false)
const testResult = ref<{ ok: boolean; message: string } | null>(null)
async function sendTest() {
  testing.value = true
  testResult.value = null
  try {
    await $fetch('/api/settings/mail/test', { method: 'POST', body: { to: testTo.value } })
    testResult.value = { ok: true, message: `Sent to ${testTo.value}. Check the inbox (and the spam folder).` }
  } catch (e) {
    testResult.value = { ok: false, message: errorMessage(e, 'The test message could not be sent') }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div v-if="data" class="space-y-8">
    <div>
      <h1 class="text-lg font-semibold text-highlighted">Email</h1>
      <p class="text-sm text-muted">Used for invitations, password resets and notifications sent by email.</p>
    </div>

    <UAlert v-if="status" :color="status.color" variant="subtle" :icon="status.icon" :title="status.title" :description="status.description" />

    <UForm :schema="schema" :state="state" class="space-y-8" @submit="onSubmit">
      <section class="space-y-4">
        <h2 class="text-sm font-semibold text-highlighted">Sender</h2>
        <UFormField
          label="From address"
          name="from"
          :help="fromLocked ? 'Set by the NUXT_MAIL_FROM environment variable.' : onCloudflare ? 'Must use a domain onboarded to Cloudflare Email Sending.' : 'The address people see messages come from.'"
        >
          <UInput v-model="state.from" placeholder="Ticketer <support@example.com>" class="w-full" :disabled="fromLocked" :trailing-icon="fromLocked ? 'i-lucide-lock' : undefined" />
        </UFormField>
      </section>

      <section v-if="!onCloudflare" class="space-y-4">
        <div>
          <h2 class="text-sm font-semibold text-highlighted">SMTP server</h2>
          <p v-if="smtpLocked" class="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <UIcon name="i-lucide-lock" class="size-4" />
            Set by the NUXT_MAIL_SMTP_URL environment variable. Remove it to manage the server here.
          </p>
          <p v-else class="mt-1 text-sm text-muted">Any provider works: your mail host, Amazon SES, Postmark, Mailgun, Resend, Gmail with an app password…</p>
        </div>
        <fieldset :disabled="smtpLocked" class="space-y-4 disabled:opacity-60">
          <div class="grid gap-4 sm:grid-cols-[1fr_7rem]">
            <UFormField label="Host" name="host">
              <UInput v-model="state.host" placeholder="smtp.example.com" class="w-full" autocomplete="off" />
            </UFormField>
            <UFormField label="Port" name="port">
              <UInputNumber v-model="state.port" :min="1" :max="65535" :format-options="{ useGrouping: false }" class="w-full" />
            </UFormField>
          </div>
          <UFormField label="Security" name="security">
            <USelect v-model="state.security" :items="securityOptions" class="w-full sm:w-64" />
          </UFormField>
          <div class="grid gap-4 sm:grid-cols-2">
            <UFormField label="Username" name="user">
              <UInput v-model="state.user" autocomplete="off" class="w-full" />
            </UFormField>
            <UFormField label="Password" name="password" :help="data.smtp.passwordSet && !clearPassword ? 'Saved. Leave empty to keep it.' : undefined">
              <UInput v-model="state.password" type="password" autocomplete="new-password" :placeholder="data.smtp.passwordSet && !clearPassword ? '••••••••' : ''" class="w-full" :disabled="clearPassword" />
            </UFormField>
          </div>
          <UCheckbox v-if="data.smtp.passwordSet" v-model="clearPassword" label="Remove the saved password" />
        </fieldset>
      </section>
      <UAlert
        v-else
        color="neutral"
        variant="subtle"
        icon="i-lucide-cloud"
        title="Delivered by Cloudflare Email Sending"
        description="On Cloudflare, mail goes through the EMAIL send_email binding; SMTP is not used. Onboard your sending domain in the Cloudflare dashboard (Email → Email Sending)."
      />

      <div class="flex justify-end">
        <UButton type="submit" label="Save" :loading="saving" :disabled="fromLocked && (smtpLocked || onCloudflare)" />
      </div>
    </UForm>

    <section class="space-y-3 rounded-lg border border-default p-4">
      <div>
        <h2 class="text-sm font-semibold text-highlighted">Send a test message</h2>
        <p class="text-sm text-muted">Uses the saved settings. Save first if you changed something.</p>
      </div>
      <form class="flex flex-col gap-2 sm:flex-row" @submit.prevent="sendTest">
        <UInput v-model="testTo" type="email" placeholder="you@example.com" class="flex-1" aria-label="Send the test message to" />
        <UButton type="submit" label="Send test" icon="i-lucide-send" color="neutral" variant="outline" :loading="testing" :disabled="!testTo" />
      </form>
      <UAlert
        v-if="testResult"
        :color="testResult.ok ? 'success' : 'error'"
        variant="subtle"
        :icon="testResult.ok ? 'i-lucide-check' : 'i-lucide-circle-alert'"
        :title="testResult.message"
      />
    </section>
  </div>
</template>
