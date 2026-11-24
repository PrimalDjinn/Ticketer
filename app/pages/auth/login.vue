<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Sign in · Ticketer' })

const schema = z.object({
  email: z.email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
})
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ email: '', password: '' })
const loading = ref(false)
const error = ref('')
const route = useRoute()
const { fetch: refreshSession } = useUserSession()
const { data: signup } = await useFetch<SignupInfo>('/api/auth/signup')
const canRegister = computed(() => !!signup.value && (signup.value.firstAccount || signup.value.mode !== 'invite'))

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    const redirect = typeof route.query.redirect === 'string' && route.query.redirect.startsWith('/') ? route.query.redirect : '/'
    await navigateTo(redirect)
  } catch (e) {
    error.value = errorMessage(e, 'Could not sign in')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-xl font-semibold text-highlighted">Welcome back</h1>
      <p class="text-sm text-muted">Sign in to manage your tickets</p>
    </div>

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="you@company.com" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Password" name="password">
        <template #hint>
          <ULink to="/auth/forgot" class="text-xs text-primary">Forgot password?</ULink>
        </template>
        <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UButton type="submit" block :loading="loading" label="Sign in" />
    </UForm>

    <p v-if="canRegister" class="text-center text-sm text-muted">
      New here?
      <ULink to="/auth/register" class="font-medium text-primary">Create an account</ULink>
    </p>
  </div>
</template>
