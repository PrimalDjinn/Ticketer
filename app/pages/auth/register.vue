<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import { refDebounced } from '@vueuse/core'

definePageMeta({ layout: 'auth' })
useSeoMeta({ title: 'Create account · Ticketer' })

const schema = z
  .object({
    email: z.email('Enter a valid email'),
    name: z.string().regex(/^[a-zA-Z0-9_]{3,30}$/, '3-30 letters, numbers or underscores'),
    password: z.string().min(8, 'Use at least 8 characters'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
type Schema = z.output<typeof schema>

const state = reactive<Partial<Schema>>({ email: '', name: '', password: '', confirm: '' })
const loading = ref(false)
const error = ref('')
const { fetch: refreshSession, user } = useUserSession()

// Suggest a username from the email until the person types their own.
const nameTouched = ref(false)
watch(
  () => state.email,
  (email) => {
    if (!nameTouched.value) state.name = (email ?? '').split('@')[0]!.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30)
  },
)

const debouncedName = refDebounced(toRef(state, 'name'), 400)
const { data: availability } = await useFetch('/api/auth/name-available', {
  query: { name: debouncedName },
  immediate: false,
  watch: [debouncedName],
  server: false,
})
const nameTaken = computed(() => !!debouncedName.value && /^[a-zA-Z0-9_]{3,30}$/.test(debouncedName.value) && availability.value?.available === false)

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    const { confirm: _, ...body } = event.data
    await $fetch('/api/auth/register', { method: 'POST', body })
    await refreshSession()
    await navigateTo('/')
  } catch (e) {
    error.value = errorMessage(e, 'Could not create the account')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1 text-center">
      <h1 class="text-xl font-semibold text-highlighted">Create your account</h1>
      <p class="text-sm text-muted">
        <template v-if="user?.isGuest">Your conversations so far will move to the new account.</template>
        <template v-else>Track tickets and talk to support in one place.</template>
      </p>
    </div>

    <UForm :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" autofocus />
      </UFormField>
      <UFormField label="Username" name="name" :error="nameTaken ? 'That username is taken' : undefined">
        <UInput v-model="state.name" autocomplete="username" class="w-full" @input="nameTouched = true">
          <template #leading><span class="text-sm text-dimmed">@</span></template>
        </UInput>
      </UFormField>
      <UFormField label="Password" name="password">
        <UInput v-model="state.password" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UFormField label="Confirm password" name="confirm">
        <UInput v-model="state.confirm" type="password" autocomplete="new-password" class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UButton type="submit" block :loading="loading" :disabled="nameTaken" label="Create account" />
    </UForm>

    <p class="text-center text-sm text-muted">
      Already registered?
      <ULink to="/auth/login" class="font-medium text-primary">Sign in</ULink>
    </p>
  </div>
</template>
