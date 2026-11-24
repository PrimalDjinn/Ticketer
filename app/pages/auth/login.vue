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
const [{ data: signup }, { data: providers }] = await Promise.all([
  useFetch<SignupInfo>('/api/auth/signup'),
  useFetch<AuthProviders>('/api/auth/providers', { default: () => ({ password: true, oidc: null }) }),
])

const redirect = computed(() => {
  const value = route.query.redirect
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? value : '/'
})
const sso = computed(() => providers.value.oidc)
const ssoHref = computed(() => `/auth/oidc/login${redirect.value !== '/' ? `?redirect=${encodeURIComponent(redirect.value)}` : ''}`)
/** SSO-only: the password form is a break-glass for admins, behind `?password`. */
const showPassword = computed(() => providers.value.password || 'password' in route.query)
const canRegister = computed(() => providers.value.password && !!signup.value && (signup.value.firstAccount || signup.value.mode !== 'invite'))

// Errors from the single sign-on callback (`oidc_…`) and from links other apps open (`launch_…`).
const problems: Record<string, { title: string; description?: string }> = {
  oidc_disabled: { title: 'Single sign-on is not set up', description: 'Sign in with your email and password, or ask an admin.' },
  oidc_state: { title: 'That sign-in took too long', description: 'It expired or was started in another browser. Try again.' },
  oidc_denied: { title: 'Sign-in was cancelled', description: 'The identity provider did not let you through. Try again, or ask an admin for access.' },
  oidc_failed: { title: 'Single sign-on failed', description: 'Try again. If it keeps failing, an admin can find the reason in the server log.' },
  oidc_unverified_email: {
    title: 'Your email is not verified',
    description: 'An account with your email already exists here, but your identity provider has not verified that address, so it was not linked. Sign in with your password, or ask an admin.',
  },
  oidc_no_email: { title: 'No email address was shared', description: 'Your identity provider did not share an email address. Ask an admin to check the scopes.' },
  oidc_no_access: { title: 'You do not have access yet', description: 'Ask an admin for an invitation.' },
  oidc_invite_used: { title: 'Your invitation was already used', description: 'Try signing in again.' },
  launch_invalid: { title: 'This link is not valid', description: 'Go back to the app you came from and try again.' },
  launch_used: { title: 'This sign-in link was already used', description: 'Go back to the app you came from and open it again.' },
  launch_replayed: { title: 'This sign-in link was already used', description: 'Go back to the app you came from and open it again.' },
  launch_expired: { title: 'This sign-in link has expired', description: 'Links work for a few minutes. Go back to the app you came from and open it again.' },
  launch_signature: { title: 'This link could not be verified', description: 'Go back to the app you came from and try again.' },
  launch_disabled: { title: 'This integration is turned off', description: 'Sign in here directly, or contact support.' },
  launch_team: { title: 'You are on the team', description: 'Team accounts cannot be signed in by other apps. Sign in here directly.' },
  launch_no_account: { title: 'You need an account first', description: 'The app you came from cannot create accounts. Sign in, or ask for an invitation.' },
}
const problem = computed(() => {
  const code = route.query.error
  if (typeof code !== 'string' || !code) return null
  return problems[code] ?? { title: 'Something went wrong signing you in', description: 'Try again.' }
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  error.value = ''
  try {
    await $fetch('/api/auth/login', { method: 'POST', body: event.data })
    await refreshSession()
    await navigateTo(redirect.value)
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

    <UAlert v-if="problem" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="problem.title" :description="problem.description" />

    <template v-if="sso">
      <UButton :to="ssoHref" external block size="lg" color="neutral" variant="outline" icon="i-lucide-key-round" :label="`Continue with ${sso.name}`" />
      <div v-if="showPassword" class="flex items-center gap-3 text-xs text-dimmed">
        <span class="h-px flex-1 bg-(--ui-border)" />
        or with your password
        <span class="h-px flex-1 bg-(--ui-border)" />
      </div>
    </template>

    <UForm v-if="showPassword" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
      <UAlert
        v-if="!providers.password"
        color="neutral"
        variant="subtle"
        icon="i-lucide-shield"
        title="Password sign-in is for admins only"
        description="Everyone else signs in with single sign-on."
      />
      <UFormField label="Email" name="email">
        <UInput v-model="state.email" type="email" autocomplete="email" placeholder="you@company.com" class="w-full" :autofocus="!sso" />
      </UFormField>
      <UFormField label="Password" name="password">
        <template v-if="providers.password" #hint>
          <ULink to="/auth/forgot" class="text-xs text-primary">Forgot password?</ULink>
        </template>
        <UInput v-model="state.password" type="password" autocomplete="current-password" class="w-full" />
      </UFormField>
      <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
      <UButton type="submit" block :loading="loading" label="Sign in" :color="sso ? 'neutral' : 'primary'" :variant="sso ? 'subtle' : 'solid'" />
    </UForm>

    <p v-if="canRegister" class="text-center text-sm text-muted">
      New here?
      <ULink to="/auth/register" class="font-medium text-primary">Create an account</ULink>
    </p>
    <p v-else-if="!showPassword" class="text-center text-xs text-dimmed">
      <ULink :to="{ query: { ...route.query, password: null } }" class="hover:text-muted">Admin sign-in with a password</ULink>
    </p>
  </div>
</template>
