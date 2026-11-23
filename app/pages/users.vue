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
      <div class="flex items-center gap-3">
        <UInput v-model="search" icon="i-lucide-search" placeholder="Search people…" class="w-full sm:w-72" />
        <span class="ml-auto text-sm text-muted">{{ filtered.length }} people</span>
      </div>
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
    </template>
  </UDashboardPanel>
</template>
