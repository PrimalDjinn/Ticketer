<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Reset password · Ticketer' })

const schema = z.object({ email: z.email('Enter a valid email') })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ email: '' })
const loading = ref(false)
const sent = ref(false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    await $fetch('/api/auth/forgot', { method: 'POST', body: event.data })
    sent.value = true
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
      <UButton type="submit" block :loading="loading" label="Send reset link" />
    </UForm>

    <p class="text-center text-sm text-muted">
      <ULink to="/auth/login" class="font-medium text-primary">Back to sign in</ULink>
    </p>
  </div>
</template>
