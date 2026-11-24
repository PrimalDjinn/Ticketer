<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import { z } from 'zod'

const roleSchema = z.enum(USER_ROLES)

definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Members · Ticketer' })

type Row = PublicUser & { createdAt: string | number }
const { user: me } = useUserSession()
const toast = useToast()
const { data: users, refresh } = await useFetch<Row[]>('/api/users', { default: () => [], deep: true })
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? users.value.filter((u) => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : users.value
})

const roleOptions = [
  { value: 'admin', label: 'Admin', description: 'Manages people, projects and support' },
  { value: 'member', label: 'Member', description: 'Creates and updates tasks' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only' },
] satisfies { value: UserRole; label: string; description: string }[]

async function setRole(row: Row, role: UserRole) {
  const previous = row.role
  row.role = role
  try {
    await $fetch(`/api/users/${row.id}`, { method: 'PATCH', body: { role } })
    row.isAdmin = role === 'admin'
    toast.add({ title: `${row.name} is now ${role === 'admin' ? 'an admin' : `a ${role}`}`, color: 'success' })
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
  { value: 'viewer', label: 'Anyone, as viewer', description: 'Open sign-up with read-only access' },
  { value: 'member', label: 'Anyone, as member', description: 'Open sign-up; new people can edit tasks' },
] satisfies { value: SignupMode; label: string; description: string }[]
const signupSchema = z.enum(SIGNUP_MODES)

async function setSignup(value: unknown) {
  if (!settings.value) return
  const previous = settings.value.signup
  const signup = signupSchema.parse(value)
  settings.value.signup = signup
  try {
    await $fetch('/api/settings', { method: 'PATCH', body: { signup } })
    toast.add({ title: signup === 'invite' ? 'Sign-up is now by invitation only' : 'Anyone can now sign up', color: 'success' })
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
]
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <AppNavbar title="Members" />
    </template>
    <template #body>
      <div class="flex flex-wrap items-center gap-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search people…" class="w-full sm:w-72" />
        <span class="text-sm text-muted">{{ filtered.length }} people</span>
        <div class="ml-auto flex items-center gap-2">
          <USelect
            v-if="settings"
            :model-value="settings.signup"
            :items="signupOptions"
            icon="i-lucide-door-open"
            aria-label="Who can sign up"
            class="w-48"
            @update:model-value="setSignup"
          />
          <UButton icon="i-lucide-user-plus" label="Invite" @click="openInvite" />
        </div>
      </div>

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
                <span class="capitalize">{{ invite.role }}</span>
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
            <div>
              <p class="font-medium text-highlighted">{{ row.original.name }}</p>
              <p class="text-xs text-muted">{{ row.original.email }}</p>
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
            class="w-32"
            @update:model-value="(v) => setRole(row.original, roleSchema.parse(v))"
          />
        </template>
      </UTable>
      <InviteModal v-model:open="inviteOpen" :created="renewed" @invited="refreshInvites()" />
    </template>
  </UDashboardPanel>
</template>
