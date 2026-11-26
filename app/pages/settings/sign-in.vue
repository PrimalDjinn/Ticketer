<script setup lang="ts">
import { z } from 'zod'

definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Sign-in · Settings' })

const toast = useToast()
const { data: settings, refresh } = await useFetch<OidcSettingsDTO>('/api/settings/oidc', { deep: true })

const ENV_NAMES = {
  enabled: 'NUXT_OIDC_ENABLED',
  issuer: 'NUXT_OIDC_ISSUER',
  clientId: 'NUXT_OIDC_CLIENT_ID',
  clientSecret: 'NUXT_OIDC_CLIENT_SECRET',
  name: 'NUXT_OIDC_NAME',
  scopes: 'NUXT_OIDC_SCOPES',
  defaultRole: 'NUXT_OIDC_DEFAULT_ROLE',
  groupsClaim: 'NUXT_OIDC_GROUPS_CLAIM',
  roleGroups: 'NUXT_OIDC_ROLE_GROUPS',
  only: 'NUXT_OIDC_ONLY',
} as const
type Field = keyof typeof ENV_NAMES
const envName = (field: Field) => ENV_NAMES[field]

const roleSchema = z.enum(USER_ROLES)
const defaultRoleSchema = z.enum(OIDC_DEFAULT_ROLES)

/** The editable copy of the form (a ref: vue-tsc 3.3 mis-types reactive objects narrowed in templates). */
const form = ref({
  enabled: false,
  issuer: '',
  clientId: '',
  clientSecret: '',
  clearClientSecret: false,
  name: '',
  scopes: '',
  defaultRole: 'external' as OidcDefaultRole,
  groupsClaim: '',
  mappings: [] as { role: UserRole; group: string }[],
  only: false,
})

function setDefaultRole(value: unknown) {
  form.value.defaultRole = defaultRoleSchema.parse(value)
}
function toggleClearSecret() {
  form.value.clearClientSecret = !form.value.clearClientSecret
}
function setMappingRole(index: number, value: unknown) {
  const mapping = form.value.mappings[index]
  if (mapping) mapping.role = roleSchema.parse(value)
}
function removeMapping(index: number) {
  form.value.mappings.splice(index, 1)
}
function addMapping() {
  form.value.mappings.push({ role: 'member', group: '' })
}

function parseMappings(text: string) {
  return text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const [role, ...rest] = part.split(':')
      const parsed = roleSchema.safeParse(role?.trim().toLowerCase())
      return parsed.success ? [{ role: parsed.data, group: rest.join(':').trim() }] : []
    })
}
const mappingText = computed(() =>
  form.value.mappings
    .filter((m) => m.group.trim())
    .map((m) => `${m.role}:${m.group.trim()}`)
    .join(','),
)

function reset() {
  const s = settings.value
  if (!s) return
  Object.assign(form.value, {
    enabled: s.enabled.value,
    issuer: s.issuer.value,
    clientId: s.clientId.value,
    clientSecret: '',
    clearClientSecret: false,
    name: s.name.value,
    scopes: s.scopes.value,
    defaultRole: s.defaultRole.value,
    groupsClaim: s.groupsClaim.value,
    mappings: parseMappings(s.roleGroups.value),
    only: s.only.value,
  })
}
watch(settings, reset, { immediate: true })

const secretSet = computed(() => settings.value?.clientSecret.set ?? false)
/** SSO-only needs single sign-on switched on, saved and working (the server enforces the same). */
const ssoWorks = computed(() => !!settings.value?.active && form.value.enabled)
// Switching single sign-on off also switches "only" off: it can't be the only way in while it's off.
watch(
  () => form.value.enabled,
  (enabled) => {
    if (!enabled && !pinned('only')) form.value.only = false
  },
)

const pinned = (field: Field) => (field === 'clientSecret' ? settings.value?.clientSecret.source : settings.value?.[field].source) === 'env'

const dirty = computed(() => {
  const s = settings.value
  if (!s) return false
  return (
    form.value.enabled !== s.enabled.value ||
    form.value.issuer.trim() !== s.issuer.value ||
    form.value.clientId.trim() !== s.clientId.value ||
    !!form.value.clientSecret.trim() ||
    form.value.clearClientSecret ||
    form.value.name.trim() !== s.name.value ||
    form.value.scopes.trim() !== s.scopes.value ||
    form.value.defaultRole !== s.defaultRole.value ||
    form.value.groupsClaim.trim() !== s.groupsClaim.value ||
    mappingText.value !== parseMappings(s.roleGroups.value).map((m) => `${m.role}:${m.group}`).join(',') ||
    form.value.only !== s.only.value
  )
})

const saving = ref(false)
async function save() {
  const s = settings.value
  if (!s) return
  // Only fields that changed and are not pinned by the environment.
  const body: Record<string, unknown> = {}
  const put = (field: Field, value: unknown, current: unknown) => {
    if (!pinned(field) && value !== current) body[field] = value
  }
  put('enabled', form.value.enabled, s.enabled.value)
  put('issuer', form.value.issuer.trim(), s.issuer.value)
  put('clientId', form.value.clientId.trim(), s.clientId.value)
  put('name', form.value.name.trim(), s.name.value)
  put('scopes', form.value.scopes.trim(), s.scopes.value)
  put('defaultRole', form.value.defaultRole, s.defaultRole.value)
  put('groupsClaim', form.value.groupsClaim.trim(), s.groupsClaim.value)
  put('roleGroups', mappingText.value, s.roleGroups.value)
  put('only', form.value.only, s.only.value)
  if (!pinned('clientSecret')) {
    if (form.value.clientSecret.trim()) body.clientSecret = form.value.clientSecret.trim()
    else if (form.value.clearClientSecret) body.clearClientSecret = true
  }
  saving.value = true
  try {
    settings.value = await $fetch<OidcSettingsDTO>('/api/settings/oidc', { method: 'PATCH', body })
    toast.add({ color: 'success', title: 'Sign-in settings saved' })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not save the settings') })
  } finally {
    saving.value = false
  }
}

const testing = ref(false)
const test = ref<OidcTestResult | null>(null)
async function testConnection() {
  testing.value = true
  test.value = null
  try {
    test.value = await $fetch<OidcTestResult>('/api/settings/oidc/test', { method: 'POST', body: { issuer: form.value.issuer.trim() || undefined } })
  } catch (e) {
    test.value = { ok: false, message: errorMessage(e, 'The test could not run') }
  } finally {
    testing.value = false
  }
}

const copied = ref(false)
async function copyCallback() {
  if (!settings.value) return
  await navigator.clipboard.writeText(settings.value.callbackUrl)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

const status = computed(() => {
  const s = settings.value
  if (!s) return null
  if (s.active) return { color: 'success' as const, label: s.only.value ? 'On, single sign-on only' : 'On', icon: 'i-lucide-circle-check' }
  if (s.enabled.value) return { color: 'warning' as const, label: 'Incomplete', icon: 'i-lucide-triangle-alert' }
  return { color: 'neutral' as const, label: 'Off', icon: 'i-lucide-circle-off' }
})

const defaultRoleOptions = [
  { value: 'external', label: 'External', description: 'Outside the team: their own and public tickets, support chat' },
  { value: 'viewer', label: 'Viewer', description: 'Joins the team, read-only' },
  { value: 'member', label: 'Member', description: 'Joins the team and can edit tasks and tickets' },
  { value: 'none', label: 'Nobody', description: 'Only invited people and mapped groups get in' },
] satisfies { value: OidcDefaultRole; label: string; description: string }[]
const roleOptions = USER_ROLES.map((value) => ({ value, label: roleMeta[value].label, icon: roleMeta[value].icon }))
</script>

<template>
  <div v-if="settings" class="mx-auto w-full max-w-3xl space-y-6">
    <section aria-labelledby="sso-heading" class="space-y-5 rounded-lg border border-default p-4 sm:p-6">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1 space-y-1">
          <h2 id="sso-heading" class="flex items-center gap-2 font-semibold text-highlighted">
            <UIcon name="i-lucide-key-round" class="size-5 text-muted" />
            Single sign-on (OpenID Connect)
          </h2>
          <p class="text-sm text-muted">
            Let people sign in with your identity provider: Authentik, Keycloak, Entra ID, Google Workspace, Zitadel or any other OpenID
            Connect provider.
          </p>
        </div>
        <UBadge v-if="status" :color="status.color" variant="subtle" :icon="status.icon" :label="status.label" />
      </div>

      <UAlert v-if="settings.problem" color="warning" variant="subtle" icon="i-lucide-triangle-alert" :title="settings.problem" />

      <div class="flex items-center justify-between gap-4 rounded-md bg-elevated/50 px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-highlighted">Enable single sign-on</p>
          <p class="text-xs text-muted">Shows “Continue with {{ form.name || 'Single sign-on' }}” on the sign-in page.</p>
        </div>
        <div class="flex items-center gap-2">
          <IntegrationsEnvBadge v-if="pinned('enabled')" :name="envName('enabled')" />
          <USwitch v-model="form.enabled" :disabled="pinned('enabled')" aria-label="Enable single sign-on" />
        </div>
      </div>

      <UFormField label="Callback URL" description="Register this as the redirect URI of the application at your provider.">
        <div class="flex gap-2">
          <UInput :model-value="settings.callbackUrl" readonly class="w-full font-mono text-xs" aria-label="Callback URL" @focus="($event.target as HTMLInputElement).select()" />
          <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied ? 'Copied' : 'Copy'" color="neutral" variant="outline" @click="copyCallback" />
        </div>
      </UFormField>

      <div class="grid gap-4 sm:grid-cols-2">
        <UFormField label="Issuer URL" class="sm:col-span-2" :help="'Authentik: https://auth.example.com/application/o/<slug>/ (the “OpenID Configuration Issuer”).'">
          <template #hint><IntegrationsEnvBadge v-if="pinned('issuer')" :name="envName('issuer')" /></template>
          <div class="flex gap-2">
            <UInput v-model="form.issuer" :disabled="pinned('issuer')" :placeholder="'https://auth.example.com/application/o/ticketer/'" class="w-full" autocomplete="off" />
            <UButton color="neutral" variant="outline" icon="i-lucide-plug-zap" label="Test connection" :loading="testing" @click="testConnection" />
          </div>
        </UFormField>

        <UAlert
          v-if="test"
          class="sm:col-span-2"
          :color="test.ok ? 'success' : 'error'"
          variant="subtle"
          :icon="test.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
          :title="test.message"
        >
          <template v-if="test.endpoints" #description>
            <dl class="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 font-mono text-xs break-all">
              <dt class="text-muted">authorize</dt>
              <dd>{{ test.endpoints.authorization }}</dd>
              <dt class="text-muted">token</dt>
              <dd>{{ test.endpoints.token }}</dd>
              <dt class="text-muted">userinfo</dt>
              <dd>{{ test.endpoints.userinfo ?? '–' }}</dd>
              <dt class="text-muted">keys</dt>
              <dd>{{ test.endpoints.jwks }}</dd>
              <template v-if="test.signingAlgs?.length">
                <dt class="text-muted">algorithms</dt>
                <dd>{{ test.signingAlgs.join(', ') }}</dd>
              </template>
            </dl>
          </template>
        </UAlert>

        <UFormField label="Client ID">
          <template #hint><IntegrationsEnvBadge v-if="pinned('clientId')" :name="envName('clientId')" /></template>
          <UInput v-model="form.clientId" :disabled="pinned('clientId')" class="w-full" autocomplete="off" />
        </UFormField>

        <UFormField label="Client secret" :help="pinned('clientSecret') ? undefined : secretSet ? 'Saved. Type a new one to replace it.' : 'Leave empty for a public client.'">
          <template #hint><IntegrationsEnvBadge v-if="pinned('clientSecret')" :name="envName('clientSecret')" /></template>
          <div class="flex gap-2">
            <UInput
              v-model="form.clientSecret"
              type="password"
              :disabled="pinned('clientSecret') || form.clearClientSecret"
              :placeholder="secretSet ? '••••••••••••' : ''"
              class="w-full"
              autocomplete="new-password"
            />
            <UButton
              v-if="secretSet && !pinned('clientSecret')"
              :color="form.clearClientSecret ? 'error' : 'neutral'"
              variant="ghost"
              :icon="form.clearClientSecret ? 'i-lucide-undo-2' : 'i-lucide-trash-2'"
              :aria-label="form.clearClientSecret ? 'Keep the saved secret' : 'Remove the saved secret'"
              @click="toggleClearSecret"
            />
          </div>
        </UFormField>

        <UFormField label="Button label" help="Default: Single sign-on">
          <template #hint><IntegrationsEnvBadge v-if="pinned('name')" :name="envName('name')" /></template>
          <UInput v-model="form.name" :disabled="pinned('name')" placeholder="Single sign-on" class="w-full" />
        </UFormField>

        <UFormField label="Scopes" help="Default: openid email profile (add groups if your provider needs it)">
          <template #hint><IntegrationsEnvBadge v-if="pinned('scopes')" :name="envName('scopes')" /></template>
          <UInput v-model="form.scopes" :disabled="pinned('scopes')" placeholder="openid email profile" class="w-full" />
        </UFormField>
      </div>
    </section>

    <section aria-labelledby="sso-access-heading" class="space-y-5 rounded-lg border border-default p-4 sm:p-6">
      <div class="space-y-1">
        <h2 id="sso-access-heading" class="font-semibold text-highlighted">Who gets in, and with which role</h2>
        <p class="text-sm text-muted">
          Accounts are matched by the provider's user id, then by a verified email (existing accounts are linked). A pending invitation for the
          email decides a new account's role. The very first account becomes an admin.
        </p>
      </div>

      <UFormField label="Role for new people" help="When no invitation or group mapping applies.">
        <template #hint><IntegrationsEnvBadge v-if="pinned('defaultRole')" :name="envName('defaultRole')" /></template>
        <USelect
          :model-value="form.defaultRole"
          :items="defaultRoleOptions"
          :disabled="pinned('defaultRole')"
          class="w-full sm:w-72"
          :ui="{ content: 'min-w-80' }"
          aria-label="Role for new people"
          @update:model-value="setDefaultRole"
        />
      </UFormField>

      <UFormField label="Groups to roles" help="When a mapped group matches, it decides the role at every sign-in (the highest one wins); the last admin is never demoted. People in no mapped group keep their role.">
        <template #hint><IntegrationsEnvBadge v-if="pinned('roleGroups')" :name="envName('roleGroups')" /></template>
        <div class="space-y-2">
          <div v-for="(mapping, index) in form.mappings" :key="index" class="flex gap-2">
            <USelect
              :model-value="mapping.role"
              :items="roleOptions"
              :disabled="pinned('roleGroups')"
              class="w-36 shrink-0"
              :aria-label="`Role for mapping ${index + 1}`"
              @update:model-value="(v) => setMappingRole(index, v)"
            />
            <UInput v-model="mapping.group" :disabled="pinned('roleGroups')" placeholder="Group name at the provider" class="min-w-0 flex-1" :aria-label="`Group for mapping ${index + 1}`" />
            <UButton
              v-if="!pinned('roleGroups')"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              :aria-label="`Remove mapping ${index + 1}`"
              @click="removeMapping(index)"
            />
          </div>
          <UButton
            v-if="!pinned('roleGroups')"
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            label="Add mapping"
            @click="addMapping"
          />
        </div>
      </UFormField>

      <UFormField label="Groups claim" help="Where the provider lists groups in the token. Default: groups (Keycloak: realm_access.roles).">
        <template #hint><IntegrationsEnvBadge v-if="pinned('groupsClaim')" :name="envName('groupsClaim')" /></template>
        <UInput v-model="form.groupsClaim" :disabled="pinned('groupsClaim')" placeholder="groups" class="w-full sm:w-72" />
      </UFormField>

      <div class="flex items-center justify-between gap-4 rounded-md bg-elevated/50 px-3 py-2.5">
        <div>
          <p class="text-sm font-medium text-highlighted">Single sign-on only</p>
          <p class="text-xs text-muted">
            Hides the password form, sign-up and password reset. Admins can still use a password at /auth/login?password in case the provider is
            down.
          </p>
          <p v-if="!ssoWorks && !form.only" class="mt-1 text-xs text-warning">Turn single sign-on on, save and test it first.</p>
        </div>
        <div class="flex items-center gap-2">
          <IntegrationsEnvBadge v-if="pinned('only')" :name="envName('only')" />
          <USwitch v-model="form.only" :disabled="pinned('only') || (!ssoWorks && !form.only)" aria-label="Single sign-on only" />
        </div>
      </div>
      <UAlert
        v-if="settings?.passwordOverride"
        color="warning"
        variant="subtle"
        icon="i-lucide-key-round"
        title="NUXT_OIDC_ALLOW_PASSWORD is set"
        description="Password sign-in, sign-up and reset work whatever “Single sign-on only” says. Remove the variable once single sign-on works again."
      />

      <p class="flex items-start gap-2 text-sm text-muted">
        <UIcon name="i-lucide-info" class="mt-0.5 size-4 shrink-0" />
        <span>
          Who may create an account with a password (invitation only, or anyone) is set on
          <ULink to="/users" class="font-medium text-primary">Members</ULink>.
        </span>
      </p>
    </section>

    <div class="sticky bottom-0 flex justify-end gap-2 border-t border-default bg-default/90 py-3 backdrop-blur">
      <UButton color="neutral" variant="ghost" label="Discard" :disabled="!dirty || saving" @click="reset" />
      <UButton label="Save" icon="i-lucide-save" :loading="saving" :disabled="!dirty" @click="save" />
    </div>
  </div>
  <UAlert v-else color="error" variant="subtle" title="Could not load the sign-in settings" @click="refresh()" />
</template>
