<script setup lang="ts">
/** Your account: who you are here, and deleting your account and data. */
definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: 'Account · Ticketer' })

interface AccountView {
  user: PublicUser
  createdAt: string | number
  hasPassword: boolean
  deletion: { blocker: string | null; privateTickets: number; publicTickets: number; conversations: number; directChats: number }
}

const toast = useToast()
const { clear } = useUserSession()
const { data } = await useFetch<AccountView>('/api/account')

const confirmOpen = ref(false)
const deleteTickets = ref(false)
const password = ref('')
const confirmText = ref('')
const deleting = ref(false)
const error = ref('')

const confirmTarget = computed(() => data.value?.user.email ?? data.value?.user.name ?? '')
const canConfirm = computed(() =>
  data.value?.hasPassword ? password.value.length > 0 : confirmText.value.trim().toLowerCase() === confirmTarget.value.toLowerCase(),
)

watch(confirmOpen, (open) => {
  if (!open) return
  password.value = ''
  confirmText.value = ''
  deleteTickets.value = false
  error.value = ''
})

/** Plain-language list of what goes, built from the preview counts. */
const removed = computed(() => {
  const d = data.value?.deletion
  if (!d) return []
  const list = ['Your profile, sign-in details and notifications']
  if (d.conversations) list.push(`${d.conversations} support conversation${d.conversations === 1 ? '' : 's'} and the files in them`)
  if (d.directChats) list.push(`${d.directChats} direct message thread${d.directChats === 1 ? '' : 's'} (for both people)`)
  return list
})

// Change password
const pw = reactive({ current: '', next: '', confirm: '' })
const pwSaving = ref(false)
const pwError = ref('')
const pwReady = computed(() => !!pw.current && pw.next.length >= 8 && pw.next === pw.confirm)
async function changePassword() {
  pwSaving.value = true
  pwError.value = ''
  try {
    await $fetch('/api/account/password', { method: 'PUT', body: { current: pw.current, password: pw.next } })
    Object.assign(pw, { current: '', next: '', confirm: '' })
    toast.add({ title: 'Password changed', color: 'success' })
  } catch (e) {
    pwError.value = errorMessage(e, 'Could not change the password')
  } finally {
    pwSaving.value = false
  }
}

async function remove() {
  deleting.value = true
  error.value = ''
  try {
    await $fetch('/api/account', {
      method: 'DELETE',
      body: {
        tickets: deleteTickets.value ? 'delete-private' : 'keep',
        ...(data.value?.hasPassword ? { password: password.value } : { confirm: confirmText.value }),
      },
    })
    confirmOpen.value = false
    await clear()
    toast.add({ title: 'Your account was deleted', description: 'Thanks for using Ticketer.', color: 'success' })
    await navigateTo('/issues')
  } catch (e) {
    error.value = errorMessage(e, 'Could not delete the account')
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UDashboardPanel id="account">
    <template #header>
      <AppNavbar title="Account" />
    </template>
    <template #body>
      <div v-if="data" class="mx-auto w-full max-w-2xl space-y-10">
        <section class="space-y-4">
          <h1 class="text-lg font-semibold text-highlighted">Your account</h1>
          <dl class="divide-y divide-default rounded-lg border border-default text-sm">
            <div class="flex gap-4 px-4 py-3">
              <dt class="w-28 shrink-0 text-muted">Username</dt>
              <dd class="text-highlighted">{{ data.user.name }}</dd>
            </div>
            <div class="flex gap-4 px-4 py-3">
              <dt class="w-28 shrink-0 text-muted">Email</dt>
              <dd class="min-w-0 truncate text-highlighted">{{ data.user.email }}</dd>
            </div>
            <div class="flex gap-4 px-4 py-3">
              <dt class="w-28 shrink-0 text-muted">Role</dt>
              <dd class="text-highlighted">
                {{ roleMeta[data.user.role].label }}
                <span class="text-muted"> — {{ roleMeta[data.user.role].description }}</span>
              </dd>
            </div>
            <div class="flex gap-4 px-4 py-3">
              <dt class="w-28 shrink-0 text-muted">Member since</dt>
              <dd class="text-highlighted">{{ formatDate(data.createdAt) }}</dd>
            </div>
          </dl>
        </section>

        <section class="space-y-4">
          <div>
            <h2 class="font-semibold text-highlighted">Password</h2>
            <p v-if="!data.hasPassword" class="mt-1 text-sm text-muted">You sign in without a password here (single sign-on or a link from another app).</p>
          </div>
          <form v-if="data.hasPassword" class="space-y-4" @submit.prevent="changePassword">
            <UFormField label="Current password">
              <UInput v-model="pw.current" type="password" autocomplete="current-password" class="w-full sm:w-80" />
            </UFormField>
            <UFormField label="New password" help="At least 8 characters.">
              <UInput v-model="pw.next" type="password" autocomplete="new-password" class="w-full sm:w-80" />
            </UFormField>
            <UFormField label="Confirm new password" :error="pw.confirm && pw.confirm !== pw.next ? 'Passwords do not match' : undefined">
              <UInput v-model="pw.confirm" type="password" autocomplete="new-password" class="w-full sm:w-80" />
            </UFormField>
            <UAlert v-if="pwError" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="pwError" class="sm:w-fit" />
            <UButton type="submit" label="Change password" :loading="pwSaving" :disabled="!pwReady" />
          </form>
        </section>

        <section class="space-y-4 rounded-lg border border-error/40 p-4">
          <div>
            <h2 class="font-semibold text-highlighted">Delete account</h2>
            <p class="mt-1 text-sm text-muted">Permanently removes your account and the data that is only about you. This can't be undone.</p>
          </div>
          <UAlert v-if="data.deletion.blocker" color="warning" variant="subtle" icon="i-lucide-shield-alert" :title="data.deletion.blocker" />
          <UButton v-else color="error" variant="soft" icon="i-lucide-user-x" label="Delete my account…" @click="confirmOpen = true" />
        </section>
      </div>

      <UModal v-model:open="confirmOpen" title="Delete your account?" description="This permanently deletes your account. It can't be undone.">
        <template #body>
          <div v-if="data" class="space-y-5 text-sm">
            <div>
              <p class="font-medium text-highlighted">Deleted</p>
              <ul class="mt-1.5 list-disc space-y-1 pl-5 text-muted">
                <li v-for="item in removed" :key="item">{{ item }}</li>
              </ul>
            </div>
            <div>
              <p class="font-medium text-highlighted">Kept, without your name</p>
              <p class="mt-1.5 text-muted">
                Tickets you opened and replies you wrote stay for the team's records and show "Deleted user" as the author.
              </p>
            </div>
            <UCheckbox
              v-if="data.deletion.privateTickets"
              v-model="deleteTickets"
              :label="`Also delete the ${data.deletion.privateTickets} private ticket${data.deletion.privateTickets === 1 ? '' : 's'} I opened`"
              :description="`Their replies and files go too, and your replies elsewhere are blanked.${data.deletion.publicTickets ? ` Public issues you reported (${data.deletion.publicTickets}) stay, without your name.` : ''}`"
            />
            <UFormField v-if="data.hasPassword" label="Your password" required>
              <UInput v-model="password" type="password" autocomplete="current-password" class="w-full" autofocus @keydown.enter="canConfirm && remove()" />
            </UFormField>
            <UFormField v-else :label="`Type ${confirmTarget} to confirm`" required>
              <UInput v-model="confirmText" autocomplete="off" class="w-full" autofocus @keydown.enter="canConfirm && remove()" />
            </UFormField>
            <UAlert v-if="error" color="error" variant="subtle" icon="i-lucide-circle-alert" :title="error" />
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton label="Cancel" color="neutral" variant="ghost" @click="confirmOpen = false" />
            <UButton label="Delete account" color="error" icon="i-lucide-trash-2" :loading="deleting" :disabled="!canConfirm" @click="remove" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
