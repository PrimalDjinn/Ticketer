<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'

const roleSchema = z.enum(USER_ROLES)

definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Members' })

type Row = PublicUser & { createdAt: string | number }
const { user: me } = useUserSession()
const toast = useToast()
const { data: users, refresh } = await useFetch<Row[]>('/api/users', { default: () => [], deep: true })
const search = ref('')
const group = ref<'all' | 'team' | 'external'>('all')
const counts = computed(() => ({
  all: users.value.length,
  team: users.value.filter((u) => roleMeta[u.role].internal).length,
  external: users.value.filter((u) => !roleMeta[u.role].internal).length,
}))
const groupTabs = computed(() => [
  { label: 'Everyone', value: 'all', badge: String(counts.value.all) },
  { label: 'Team', value: 'team', badge: String(counts.value.team) },
  { label: 'External', value: 'external', badge: String(counts.value.external) },
])
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return users.value.filter(
    (u) =>
      (group.value === 'all' || (group.value === 'team') === roleMeta[u.role].internal) &&
      (!q || u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)),
  )
})

const roleOptions = [
  { type: 'label' as const, label: 'Team' },
  ...(['admin', 'member', 'viewer'] as const).map((value) => ({ value, label: roleMeta[value].label, description: roleMeta[value].description, icon: roleMeta[value].icon })),
  { type: 'separator' as const },
  { type: 'label' as const, label: 'Outside the team' },
  { value: 'external' as const, label: roleMeta.external.label, description: roleMeta.external.description, icon: roleMeta.external.icon },
]

async function setRole(row: Row, role: UserRole) {
  const previous = row.role
  row.role = role
  try {
    await $fetch(`/api/users/${row.id}`, { method: 'PATCH', body: { role } })
    row.isAdmin = role === 'admin'
    row.isInternal = roleMeta[role].internal
    toast.add({ title: `${row.name} is now ${rolePhrase(role)}`, color: 'success' })
  } catch (e) {
    row.role = previous
    toast.add({ title: errorMessage(e), color: 'error' })
    await refresh()
  }
}

// Invitations and who may sign up without one.
const { data: invites, refresh: refreshInvites } = await useFetch<InviteDTO[]>('/api/invites', { default: () => [] })
const { data: settings } = await useFetch<{ signup: SignupMode }>('/api/settings', { deep: true })
const inviteOpen = ref(false)
const renewed = ref<InviteCreated | null>(null)
const busyInvite = ref<number | null>(null)

const signupOptions = [
  { value: 'invite', label: 'Invitation only', description: 'People join through an invitation link' },
  { value: 'external', label: 'Anyone, as external', description: 'Customer portal: their own tickets, public issues and support chat' },
  { value: 'viewer', label: 'Anyone, as viewer', description: 'Joins the team with read-only access' },
  { value: 'member', label: 'Anyone, as member', description: 'Joins the team and can edit tasks and tickets' },
] satisfies { value: SignupMode; label: string; description: string }[]
const signupSchema = z.enum(SIGNUP_MODES)

async function setSignup(value: unknown) {
  if (!settings.value) return
  const previous = settings.value.signup
  const signup = signupSchema.parse(value)
  settings.value.signup = signup
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { signup } })
    toast.add({ title: signup === 'invite' ? 'Sign-up is now by invitation only' : `Anyone can now sign up as ${rolePhrase(signup)}`, color: 'success' })
  } catch (e) {
    settings.value.signup = previous
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}

function openInvite() {
  renewed.value = null
  inviteOpen.value = true
}

async function resend(invite: InviteDTO) {
  busyInvite.value = invite.id
  try {
    renewed.value = await $fetch<InviteCreated>(`/api/invites/${invite.id}/resend`, { method: 'POST' })
    inviteOpen.value = true
    await refreshInvites()
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not renew the invitation'), color: 'error' })
  } finally {
    busyInvite.value = null
  }
}

async function revoke(invite: InviteDTO) {
  busyInvite.value = invite.id
  try {
    await $fetch(`/api/invites/${invite.id}`, { method: 'DELETE' })
    invites.value = invites.value.filter((i) => i.id !== invite.id)
    toast.add({ title: `Invitation for ${invite.email} revoked`, color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    busyInvite.value = null
  }
}

const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Joined' },
  { accessorKey: 'role', header: 'Role' },
  { id: 'actions', header: () => h('span', { class: 'sr-only' }, 'Actions') },
]

// Deleting someone (e.g. a data-deletion request). Their tickets stay by default, without their name.
const deleting = ref<Row | null>(null)
const deleteOpen = computed({ get: () => !!deleting.value, set: (v) => !v && (deleting.value = null) })
const deleteTickets = ref(false)
const deleteConfirm = ref('')
const deleteBusy = ref(false)
function askDelete(row: Row) {
  deleting.value = row
  deleteTickets.value = false
  deleteConfirm.value = ''
}
async function confirmDelete() {
  const row = deleting.value
  if (!row) return
  deleteBusy.value = true
  try {
    await $fetch(`/api/users/${row.id}`, { method: 'DELETE', query: { tickets: deleteTickets.value ? 'delete' : 'keep' } })
    users.value = users.value.filter((u) => u.id !== row.id)
    toast.add({ title: `${row.name}'s account was deleted`, color: 'success' })
    deleting.value = null
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not delete the account'), color: 'error' })
  } finally {
    deleteBusy.value = false
  }
}
const signupWarning = computed(() => settings.value && (settings.value.signup === 'member' || settings.value.signup === 'viewer'))
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <AppNavbar title="Members" />
    </template>
    <template #body>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search people…" class="w-full sm:w-64" />
        <UTabs v-model="group" :items="groupTabs" :content="false" size="sm" variant="pill" class="w-full sm:w-auto" />
        <div class="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <USelect
            v-if="settings"
            :model-value="settings.signup"
            :items="signupOptions"
            icon="i-lucide-door-open"
            aria-label="Who can sign up"
            class="min-w-0 flex-1 sm:w-52 sm:flex-none"
            :ui="{ content: 'min-w-80' }"
            @update:model-value="setSignup"
          />
          <UButton icon="i-lucide-user-plus" label="Invite" @click="openInvite" />
        </div>
      </div>
      <UAlert
        v-if="signupWarning"
        color="warning"
        variant="subtle"
        icon="i-lucide-triangle-alert"
        title="Anyone who finds the sign-up page joins your team"
        :description="`New accounts become ${settings?.signup === 'member' ? 'members who can edit projects, tasks and tickets' : 'viewers who can read every project and ticket'}. Choose “Anyone, as external” for a customer portal.`"
      />

      <section v-if="invites.length" aria-labelledby="pending-invites" class="rounded-lg border border-default">
        <h2 id="pending-invites" class="border-b border-default px-4 py-2.5 text-sm font-medium text-highlighted">
          Pending invitations <span class="font-normal text-muted">({{ invites.length }})</span>
        </h2>
        <ul class="divide-y divide-default">
          <li v-for="invite in invites" :key="invite.id" class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
            <UIcon name="i-lucide-mail" class="size-4 shrink-0 text-dimmed" />
            <div class="min-w-0 flex-1">
              <p class="truncate text-sm font-medium text-highlighted">{{ invite.email }}</p>
              <p class="text-xs text-muted">
                <span>{{ roleMeta[invite.role].label }}</span>
                <template v-if="invite.invitedBy"> · invited by {{ invite.invitedBy }}</template>
                ·
                <span v-if="invite.expired" class="text-warning">expired</span>
                <template v-else>expires <NuxtTime :datetime="invite.expiresAt" relative :title="formatDateTime(invite.expiresAt)" /></template>
              </p>
            </div>
            <div class="flex gap-1">
              <UButton
                size="sm"
                color="neutral"
                variant="ghost"
                icon="i-lucide-refresh-cw"
                :label="invite.expired ? 'Renew' : 'Resend'"
                :loading="busyInvite === invite.id"
                @click="resend(invite)"
              />
              <UButton size="sm" color="error" variant="ghost" icon="i-lucide-x" label="Revoke" :disabled="busyInvite === invite.id" @click="revoke(invite)" />
            </div>
          </li>
        </ul>
      </section>
      <UTable :data="filtered" :columns="columns">
        <template #name-cell="{ row }">
          <div class="flex items-center gap-3">
            <UAvatar :text="initials(row.original.name)" size="sm" />
            <div class="min-w-0">
              <p class="flex items-center gap-1.5 font-medium text-highlighted">
                {{ row.original.name }}
                <UBadge v-if="!roleMeta[row.original.role].internal" label="External" color="neutral" variant="subtle" size="sm" icon="i-lucide-globe" />
              </p>
              <p class="truncate text-xs text-muted">{{ row.original.email }}</p>
            </div>
          </div>
        </template>
        <template #createdAt-cell="{ row }">
          <span class="text-sm text-muted">{{ formatDate(row.original.createdAt) }}</span>
        </template>
        <template #role-cell="{ row }">
          <USelect
            :model-value="row.original.role"
            :items="roleOptions"
            :disabled="row.original.id === me?.id"
            :aria-label="`Role for ${row.original.name}`"
            class="w-36"
            :ui="{ content: 'min-w-72' }"
            @update:model-value="(v) => setRole(row.original, roleSchema.parse(v))"
          />
        </template>
        <template #actions-cell="{ row }">
          <div class="flex justify-end">
            <UTooltip v-if="row.original.id !== me?.id" text="Delete account">
              <UButton icon="i-lucide-user-x" color="neutral" variant="ghost" size="sm" :aria-label="`Delete ${row.original.name}'s account`" @click="askDelete(row.original)" />
            </UTooltip>
          </div>
        </template>
      </UTable>
      <UModal v-model:open="deleteOpen" :title="`Delete ${deleting?.name}'s account?`" description="This can't be undone.">
        <template #body>
          <div v-if="deleting" class="space-y-4 text-sm">
            <p class="text-muted">
              Removes their profile, sign-in details, notifications, support conversations and direct messages. Tasks and project history stay,
              showing "Deleted user".
            </p>
            <UCheckbox
              v-model="deleteTickets"
              label="Also delete every ticket they opened"
              description="Including public issues. Their replies on other tickets are blanked. Leave unticked to keep tickets for your records, without their name."
            />
            <UFormField :label="`Type ${deleting.name} to confirm`">
              <UInput v-model="deleteConfirm" autocomplete="off" class="w-full" autofocus />
            </UFormField>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="deleting = null" />
            <UButton
              label="Delete account"
              color="error"
              icon="i-lucide-trash-2"
              :loading="deleteBusy"
              :disabled="deleteConfirm.trim() !== deleting?.name"
              @click="confirmDelete"
            />
          </div>
        </template>
      </UModal>
      <InviteModal v-model:open="inviteOpen" :created="renewed" @invited="refreshInvites()" />
    </template>
  </UDashboardPanel>
</template>
