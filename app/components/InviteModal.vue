<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

/**
 * Invite someone by email. After sending, the modal shows the link so it can be shared by hand too (for example when
 * mail is not configured). Also shows a renewed link when `created` is passed in from "Resend".
 */
const open = defineModel<boolean>('open', { default: false })
const props = defineProps<{ created?: InviteCreated | null }>()
const emit = defineEmits<{ invited: [result: InviteCreated] }>()
const toast = useToast()

const schema = z.object({
  email: z.email('Enter a valid email'),
  role: z.enum(USER_ROLES),
})
type Schema = z.output<typeof schema>

const roleOptions = [
  { value: 'member', label: 'Member', description: 'Creates and updates tasks' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only' },
  { value: 'admin', label: 'Admin', description: 'Manages people, projects and support' },
] satisfies { value: UserRole; label: string; description: string }[]

const state = reactive<Partial<Schema>>({ email: '', role: 'member' })
const loading = ref(false)
const result = ref<InviteCreated | null>(null)
const copied = ref(false)

watch(open, (value) => {
  if (!value) return
  Object.assign(state, { email: '', role: 'member' })
  result.value = props.created ?? null
  copied.value = false
})

async function onSubmit(event: FormSubmitEvent<Schema>) {
  loading.value = true
  try {
    result.value = await $fetch<InviteCreated>('/api/invites', { method: 'POST', body: event.data })
    emit('invited', result.value)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not send the invitation') })
  } finally {
    loading.value = false
  }
}

async function copy() {
  if (!result.value) return
  await navigator.clipboard.writeText(result.value.link)
  copied.value = true
  setTimeout(() => (copied.value = false), 2000)
}

function inviteAnother() {
  Object.assign(state, { email: '', role: state.role })
  result.value = null
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="result ? 'Invitation ready' : 'Invite people'"
    :description="result ? undefined : `They get a link to create their account. It works for ${INVITE_TTL_DAYS} days.`"
  >
    <template #body>
      <div v-if="result" class="space-y-4">
        <UAlert
          :color="result.emailed ? 'success' : 'warning'"
          variant="subtle"
          :icon="result.emailed ? 'i-lucide-mail-check' : 'i-lucide-mail-x'"
          :title="result.emailed ? `Emailed to ${result.invite.email}` : `Email not sent to ${result.invite.email}`"
          :description="result.emailed ? 'You can also share the link yourself.' : 'Mail is not set up for this site. Send them the link below yourself.'"
        />
        <UFormField label="Invitation link" :help="`Only shown now. Anyone with the link can join as ${result.invite.role}.`">
          <div class="flex gap-2">
            <UInput :model-value="result.link" readonly class="w-full font-mono text-xs" aria-label="Invitation link" @focus="($event.target as HTMLInputElement).select()" />
            <UButton :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'" :label="copied ? 'Copied' : 'Copy'" color="neutral" variant="outline" @click="copy" />
          </div>
        </UFormField>
      </div>
      <UForm v-else id="invite-form" :schema="schema" :state="state" class="space-y-4" @submit="onSubmit">
        <UFormField label="Email" name="email">
          <UInput v-model="state.email" type="email" placeholder="name@company.com" class="w-full" autofocus />
        </UFormField>
        <UFormField label="Role" name="role">
          <USelect v-model="state.role" :items="roleOptions" class="w-full" />
        </UFormField>
      </UForm>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <template v-if="result">
          <UButton v-if="!created" label="Invite another" color="neutral" variant="ghost" @click="inviteAnother" />
          <UButton label="Done" @click="open = false" />
        </template>
        <template v-else>
          <UButton label="Cancel" color="neutral" variant="ghost" @click="open = false" />
          <UButton type="submit" form="invite-form" label="Send invitation" icon="i-lucide-send" :loading="loading" />
        </template>
      </div>
    </template>
  </UModal>
</template>
