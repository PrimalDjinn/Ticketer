<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'

definePageMeta({ middleware: ['auth', 'admin'] })
useSeoMeta({ title: 'Users · Ticketer' })

type Row = PublicUser & { createdAt: string | number }
const { user: me } = useUserSession()
const toast = useToast()
const { data: users, refresh } = await useFetch<Row[]>('/api/users', { default: () => [] })
const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? users.value.filter((u) => u.name.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)) : users.value
})

async function setAdmin(row: Row, isAdmin: boolean) {
  try {
    await $fetch(`/api/users/${row.id}`, { method: 'PATCH', body: { isAdmin } })
    row.isAdmin = isAdmin
    toast.add({ title: isAdmin ? `${row.name} is now an admin` : `${row.name} is no longer an admin`, color: 'success' })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
    await refresh()
  }
}

const columns: TableColumn<Row>[] = [
  { accessorKey: 'name', header: 'Name' },
  { accessorKey: 'createdAt', header: 'Joined' },
  { accessorKey: 'isAdmin', header: 'Admin' },
]
</script>

<template>
  <UDashboardPanel id="users">
    <template #header>
      <AppNavbar title="Users" />
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
        <template #isAdmin-cell="{ row }">
          <USwitch
            :model-value="row.original.isAdmin"
            :disabled="row.original.id === me?.id"
            :aria-label="`Admin access for ${row.original.name}`"
            @update:model-value="(v: boolean) => setAdmin(row.original, v)"
          />
        </template>
      </UTable>
    </template>
  </UDashboardPanel>
</template>
