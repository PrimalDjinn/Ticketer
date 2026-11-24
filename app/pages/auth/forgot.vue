<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Reset password' })

const schema = z.object({ email: z.email('Enter a valid email') })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ email: '' })
const loading = ref(false)
const sent = ref(false)
const error = ref('')
const captcha = useCaptcha()
const { widget: captchaWidget, token: captchaToken } = captcha

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/forgot', { method: 'POST', body: event.data, headers: captcha.headers() })
    sent.value = true
  } catch (e) {
    error.value = errorMessage(e, 'Could not send the link')
    captcha.spent()
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-xl font-semibold text-highlighted">Forgot your password?</h1>
      <p class="text-sm text-muted">We'll email you a link to choose a new one.</p>
    </div>

    <UAlert
      v-if="sent"
      color="success"
      variant="subtle"
      icon="i-lucide-mail-check"
      title="Check your inbox"
      :description="`If ${state.email} has an account, a reset link is on its way. It expires in an hour.`"
    />
    <UForm v-else :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" autofocus />
      </UFormField>
      <CaptchaWidget ref="captchaWidget" v-model="captchaToken" />
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UButton type="submit" block :loading="loading" :disabled="!captcha.ready.value" label="Send reset link" />
    </UForm>

    <p class="text-center text-sm text-muted">
      <ULink to="/auth/login" class="font-medium text-primary">Back to sign in</ULink>
    </p>
  </div>
</template>
