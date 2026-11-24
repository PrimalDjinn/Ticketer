<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Choose a new password' })

const route = useRoute()
const schema = z
  .object({ password: z.string().min(8, 'Use at least 8 characters'), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type Schema = z.output<typeof schema>
const state = reactive<Partial<Schema>>({ password: '', confirm: '' })
const loading = ref(false)
const error = ref('')
const { fetch: refreshSession } = useUserSession()

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/reset', { method: 'POST', body: { token: String(route.params.token), password: event.data.password } })
    await refreshSession()
    await navigateTo('/')
  } catch (e) {
    error.value = errorMessage(e, 'Could not reset the password')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-xl font-semibold text-highlighted">Choose a new password</h1>
      <p class="text-sm text-muted">You'll be signed in right after.</p>
    </div>
    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="New password" name="password">
        <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Confirm password" name="confirm">
        <UInput v-model="state.confirm" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error">
        <template #description>
          <ULink to="/auth/forgot" class="underline">Request a new link</ULink>
        </template>
      </UAlert>
      <UButton type="submit" block :loading="loading" label="Save password" />
    </UForm>
  </div>
</template>
