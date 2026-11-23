<script setup lang="ts">
import type { CommentNode } from '~/components/CommentItem.vue'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { user } = useUserSession()
const toast = useToast()

// deep: realtime handlers patch comments and status in place.
const { data: ticket, error, refresh } = await useFetch<TicketDetailDTO>(() => `/api/tickets/${id.value}`, { deep: true })
if (error.value) {
  throw createError({ status: error.value.statusCode ?? 404, message: errorMessage(error.value, 'Ticket not found'), fatal: true })
}
const { data: people } = await useFetch<PublicUser[]>(() => `/api/tickets/${id.value}/mentionable`, { default: () => [] })

useSeoMeta({ title: () => `#${ticket.value ? shortRef(ticket.value.reference) : ''} · Ticketer` })

const thread = computed<CommentNode[]>(() => commentTree(ticket.value?.comments ?? []))

function addComment(comment: CommentDTO) {
  if (!ticket.value || comment.ticketId !== ticket.value.id) return
  if (!ticket.value.comments.some((c) => c.id === comment.id)) ticket.value.comments.push(comment)
}
function removeComment(commentId: number) {
  if (!ticket.value) return
  const gone = commentThreadIds(ticket.value.comments, commentId) // replies go with their parent
  ticket.value.comments = ticket.value.comments.filter((c) => !gone.has(c.id))
}

onRealtime('comment.created', addComment)
onRealtime('comment.deleted', ({ id: commentId, ticketId }) => ticketId === id.value && removeComment(commentId))
onRealtime('ticket.updated', (t) => {
  if (ticket.value && t.id === ticket.value.id) Object.assign(ticket.value, { ...t, creatorName: t.creatorName ?? ticket.value.creatorName })
})
onRealtime('ticket.deleted', async ({ id: deleted }) => {
  if (deleted !== id.value) return
  toast.add({ title: 'This ticket was deleted', color: 'warning' })
  await navigateTo('/tickets')
})
onRealtimeResync(() => refresh())

// Jump to a comment linked from a notification once it has rendered.
onMounted(() => {
  if (route.hash) nextTick(() => document.querySelector(route.hash)?.scrollIntoView({ behavior: 'smooth' }))
})

const updating = ref<TicketStatus | null>(null)
async function setStatus(status: TicketStatus) {
  updating.value = status
  try {
    const updated = await $fetch<TicketDTO>(`/api/tickets/${id.value}`, { method: 'PATCH', body: { status } })
    Object.assign(ticket.value!, { ...updated, creatorName: ticket.value!.creatorName })
    toast.add({ title: `Marked ${status.toLowerCase()}`, color: 'success', icon: statusMeta[status].icon })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    updating.value = null
  }
}

const confirmDelete = ref(false)
async function deleteTicket() {
  try {
    await $fetch(`/api/tickets/${id.value}`, { method: 'DELETE' })
    toast.add({ title: 'Ticket deleted', color: 'success' })
    await navigateTo('/tickets')
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  }
}

// Support -> project hand-off
const { active: projects, refresh: refreshProjects } = useProjects()
if (user.value?.isAdmin) await refreshProjects()
const handingOff = ref(false)
const handOffItems = computed(() =>
  projects.value.map((p) => ({ label: p.name, suffix: p.key, onSelect: () => createTask(p.key) })),
)
async function createTask(projectKey: string) {
  handingOff.value = true
  try {
    const task = await $fetch<TaskDTO & { projectKey: string }>(`/api/tickets/${id.value}/task`, { method: 'POST', body: { projectKey } })
    await refresh()
    toast.add({
      title: `Created ${task.ref}`,
      icon: 'i-lucide-circle-check',
      color: 'success',
      actions: [{ label: 'Open', to: `/projects/${projectKey}/${task.number}`, variant: 'outline' }],
    })
  } catch (e) {
    toast.add({ title: errorMessage(e, 'Could not create the task'), color: 'error' })
  } finally {
    handingOff.value = false
  }
}

async function copyReference() {
  await navigator.clipboard.writeText(ticket.value!.reference)
  toast.add({ title: 'Reference copied', icon: 'i-lucide-copy-check' })
}
</script>

<template>
  <UDashboardPanel id="ticket">
    <template #header>
      <AppNavbar :title="ticket ? `Ticket #${shortRef(ticket.reference)}` : 'Ticket'">
        <template #right>
          <UButton to="/tickets" color="neutral" variant="ghost" icon="i-lucide-arrow-left" label="Back" class="hidden sm:inline-flex" />
        </template>
      </AppNavbar>
    </template>

    <template #body>
      <div v-if="ticket" class="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1fr_18rem]">
        <div class="min-w-0 space-y-8">
          <section class="space-y-4">
            <div class="flex flex-wrap items-center gap-2">
              <TicketStatusBadge :status="ticket.status" />
              <TicketUrgencyBadge v-if="ticket.urgency !== 'Default'" :urgency="ticket.urgency" />
            </div>
            <p class="text-base leading-relaxed whitespace-pre-wrap break-words text-highlighted">{{ ticket.info }}</p>
            <AttachmentGrid :attachments="ticket.attachments" />
          </section>

          <section class="space-y-6">
            <h2 class="flex items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-messages-square" class="size-4" />
              Activity
              <UBadge :label="String(ticket.comments.length)" color="neutral" variant="subtle" size="sm" />
            </h2>

            <p v-if="!thread.length" class="text-sm text-muted">No comments yet. Add context, ask a question, or attach a document.</p>
            <div v-else class="space-y-6">
              <CommentItem
                v-for="comment in thread"
                :key="comment.id"
                :comment="comment"
                :endpoint="`/api/tickets/${ticket.id}/comments`"
                :people="people"
                @posted="addComment"
                @deleted="removeComment"
              />
            </div>

            <CommentComposer :endpoint="`/api/tickets/${ticket.id}/comments`" :people="people" @posted="addComment" />
          </section>
        </div>

        <aside class="space-y-6 lg:sticky lg:top-0 lg:self-start">
          <UCard variant="subtle">
            <dl class="space-y-4 text-sm">
              <div>
                <dt class="text-muted">Reference</dt>
                <dd class="mt-0.5 flex items-center gap-1 font-mono text-xs text-highlighted">
                  <span class="truncate">{{ ticket.reference }}</span>
                  <UButton icon="i-lucide-copy" size="xs" color="neutral" variant="ghost" aria-label="Copy reference" @click="copyReference" />
                </dd>
              </div>
              <div>
                <dt class="text-muted">Opened by</dt>
                <dd class="mt-0.5 flex items-center gap-2 text-highlighted">
                  <UAvatar :text="initials(ticket.creatorName ?? '?')" size="2xs" />
                  {{ ticket.creatorName ?? 'Unknown' }}
                </dd>
              </div>
              <div>
                <dt class="text-muted">Opened</dt>
                <dd class="mt-0.5 text-highlighted">{{ formatDateTime(ticket.createdAt) }}</dd>
              </div>
              <div v-if="ticket.resolvedAt">
                <dt class="text-muted">{{ ticket.status === 'Closed' ? 'Closed' : 'Resolved' }}</dt>
                <dd class="mt-0.5 text-highlighted">{{ formatDateTime(ticket.resolvedAt) }}</dd>
              </div>
            </dl>
          </UCard>

          <UCard v-if="ticket.tasks.length || (user?.isAdmin && projects.length)" variant="subtle">
            <p class="mb-3 text-sm font-medium text-highlighted">Tasks</p>
            <ul v-if="ticket.tasks.length" class="mb-3 space-y-1.5">
              <li v-for="t in ticket.tasks" :key="t.id">
                <NuxtLink :to="`/projects/${t.projectKey}/${t.number}`" class="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm hover:bg-elevated">
                  <UIcon :name="t.isDone ? 'i-lucide-circle-check' : 'i-lucide-circle-dashed'" class="size-4 shrink-0" :class="t.isDone ? 'text-success' : 'text-muted'" />
                  <span class="font-mono text-xs text-muted">{{ t.ref }}</span>
                  <span class="min-w-0 flex-1 truncate">{{ t.title }}</span>
                </NuxtLink>
                <p class="ml-7 text-xs text-dimmed">{{ t.status }}</p>
              </li>
            </ul>
            <UDropdownMenu v-if="user?.isAdmin && projects.length" :items="handOffItems" :content="{ align: 'start' }">
              <UButton icon="i-lucide-folder-input" label="Create task in…" color="neutral" variant="outline" size="sm" block :loading="handingOff" />
            </UDropdownMenu>
          </UCard>

          <UCard v-if="user?.isAdmin" variant="subtle">
            <p class="mb-3 text-sm font-medium text-highlighted">Status</p>
            <div class="grid grid-cols-2 gap-2">
              <UButton
                v-for="status in TICKET_STATUSES"
                :key="status"
                :icon="statusMeta[status].icon"
                :label="statusMeta[status].label"
                :color="ticket.status === status ? statusMeta[status].color : 'neutral'"
                :variant="ticket.status === status ? 'soft' : 'outline'"
                :loading="updating === status"
                :disabled="ticket.status === status"
                size="sm"
                block
                @click="setStatus(status)"
              />
            </div>
            <USeparator class="my-4" />
            <UButton color="error" variant="ghost" icon="i-lucide-trash-2" label="Delete ticket" block size="sm" @click="confirmDelete = true" />
          </UCard>
        </aside>
      </div>

      <UModal v-model:open="confirmDelete" title="Delete this ticket?" description="The ticket, its comments and every attached file are removed for good.">
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Keep it" @click="confirmDelete = false" />
            <UButton color="error" icon="i-lucide-trash-2" label="Delete" @click="deleteTicket" />
          </div>
        </template>
      </UModal>
    </template>
  </UDashboardPanel>
</template>
