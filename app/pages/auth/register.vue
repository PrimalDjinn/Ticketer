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

const route = useRoute()
const inviteToken = computed(() => (typeof route.query.invite === 'string' && route.query.invite ? route.query.invite : undefined))
const { data: signup } = await useFetch<SignupInfo>('/api/auth/signup', { query: { invite: inviteToken } })
const invite = computed(() => signup.value?.invite ?? null)
/** Without an invitation, the form only shows for the first account or when an admin has opened sign-up. */
const closed = computed(() => !!signup.value && !invite.value && !signup.value.firstAccount && signup.value.mode === 'invite')
const ROLE_PHRASE: Record<UserRole, string> = { admin: 'an admin', member: 'a member', viewer: 'a viewer' }

const state = reactive<Partial<Schema>>({ email: invite.value?.email ?? '', name: '', password: '', confirm: '' })
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
  { immediate: true },
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
    await $fetch('/api/auth/register', { method: 'POST', body: { ...body, invite: invite.value ? inviteToken.value : undefined } })
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
      <h1 class="text-xl font-semibold text-highlighted">{{ invite ? 'Accept your invitation' : closed ? 'Invitation needed' : 'Create your account' }}</h1>
      <p class="text-sm text-muted">
        <template v-if="invite">
          <span v-if="invite.invitedBy" class="font-medium text-default">{{ invite.invitedBy }}</span>
          <template v-else>You were</template>
          {{ invite.invitedBy ? 'invited you' : 'invited' }} to join as {{ ROLE_PHRASE[invite.role] }}.
        </template>
        <template v-else-if="closed">Ticketer accounts are by invitation. Ask an admin to invite you.</template>
        <template v-else-if="user?.isGuest">Your conversations so far will move to the new account.</template>
        <template v-else>Track tickets and talk to support in one place.</template>
      </p>
    </div>

    <UAlert v-if="signup?.inviteError" color="warning" variant="subtle" icon="i-lucide-mail-warning" :title="signup.inviteError" />

    <UForm v-if="!closed" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UFormField label="Email" name="email" :help="invite ? 'The invitation is for this address.' : undefined">
        <UInput v-model="state.email" type="email" autocomplete="email" class="w-full" :readonly="!!invite" :autofocus="!invite" />
      </UFormField>
      <UFormField label="Username" name="name" :error="nameTaken ? 'That username is taken' : undefined">
        <UInput v-model="state.name" autocomplete="username" class="w-full" :autofocus="!!invite" @input="nameTouched = true">
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
      <UButton type="submit" block :loading="loading" :disabled="nameTaken" :label="invite ? 'Join' : 'Create account'" />
    </UForm>

    <p class="text-center text-sm text-muted">
      Already registered?
      <ULink to="/auth/login" class="font-medium text-primary">Sign in</ULink>
    </p>
  </div>
</template>
