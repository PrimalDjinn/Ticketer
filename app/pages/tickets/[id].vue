<script setup lang="ts">
import type { CommentNode } from '~/components/CommentItem.vue'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const id = computed(() => Number(route.params.id))
const { user, internal, staff, admin, registered } = useAccess()
const toast = useToast()
const requestUrl = useRequestURL()

// deep: realtime handlers patch comments and status in place.
const { data: ticket, error, refresh } = await useFetch<TicketDetailDTO>(() => `/api/tickets/${id.value}`, { deep: true })
if (error.value) {
  throw createError({ status: error.value.statusCode ?? 404, message: errorMessage(error.value, 'Ticket not found'), fatal: true })
}
const { data: people } = await useFetch<PublicUser[]>(() => `/api/tickets/${id.value}/mentionable`, { default: () => [] })

useSeoMeta({ title: () => (ticket.value ? `${ticket.value.title} · #${shortRef(ticket.value.reference)} · Ticketer` : 'Ticket · Ticketer') })

const isReporter = computed(() => !!ticket.value?.creatorId && ticket.value.creatorId === user.value?.id)
const isPublic = computed(() => ticket.value?.visibility === 'public')
/** Mirrors the server: staff anywhere, the reporter on their own ticket, registered outside people on public tickets. */
const canReply = computed(() => staff.value || isReporter.value || (isPublic.value && registered.value && !internal.value))
const canFollow = computed(() => registered.value || isReporter.value)
const publicLink = computed(() => (ticket.value ? `${requestUrl.origin}/issues/${ticket.value.reference}` : ''))

const thread = computed<CommentNode[]>(() => commentTree(ticket.value?.comments ?? []))
const publicCount = computed(() => ticket.value?.comments.filter((c) => !c.internal).length ?? 0)
const noteCount = computed(() => (ticket.value?.comments.length ?? 0) - publicCount.value)

function addComment(comment: CommentDTO) {
  if (!ticket.value || comment.ticketId !== ticket.value.id) return
  if (!ticket.value.comments.some((c) => c.id === comment.id)) ticket.value.comments.push(comment)
  // Replying follows the ticket.
  if (comment.authorId === user.value?.id && !ticket.value.watching) {
    ticket.value.watching = true
    ticket.value.watcherCount++
  }
}
function removeComment(commentId: number) {
  if (!ticket.value) return
  const gone = commentThreadIds(ticket.value.comments, commentId) // replies go with their parent
  ticket.value.comments = ticket.value.comments.filter((c) => !gone.has(c.id))
}

/** Keeps names we already know when an update arrives without them (outside people get no user ids). */
function applyTicket(t: TicketDTO) {
  if (!ticket.value || t.id !== ticket.value.id) return
  Object.assign(ticket.value, {
    ...t,
    creatorId: t.creatorId ?? ticket.value.creatorId,
    creatorName: t.creatorName ?? ticket.value.creatorName,
  })
}

onRealtime('comment.created', addComment)
onRealtime('comment.deleted', ({ id: commentId, ticketId }) => ticketId === id.value && removeComment(commentId))
onRealtime('ticket.updated', applyTicket)
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

async function patch(body: Record<string, unknown>, success: (t: TicketDTO) => string) {
  const updated = await $fetch<TicketDTO>(`/api/tickets/${id.value}`, { method: 'PATCH', body })
  applyTicket(updated)
  toast.add({ title: success(updated), color: 'success', icon: 'i-lucide-circle-check' })
  return updated
}

// --- Title (staff edit inline) ---
const editingTitle = ref(false)
const titleDraft = ref('')
const savingTitle = ref(false)
function editTitle() {
  titleDraft.value = ticket.value?.title ?? ''
  editingTitle.value = true
}
async function saveTitle() {
  const title = titleDraft.value.trim()
  if (!title || title === ticket.value?.title) return (editingTitle.value = false)
  savingTitle.value = true
  try {
    await patch({ title }, () => 'Title updated')
    editingTitle.value = false
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    savingTitle.value = false
  }
}

// --- Assignment (any staff person) ---
const { data: staffPeople } = await useFetch<PublicUser[]>('/api/members', { default: () => [], immediate: staff.value })
const staffItems = computed(() => [
  { label: 'Unassigned', value: null, icon: 'i-lucide-user-x' },
  ...staffPeople.value.map((p) => ({ label: p.id === user.value?.id ? `${p.name} (you)` : p.name, value: p.id, avatar: { text: initials(p.name) } })),
])
const assigning = ref(false)
async function assign(assigneeId: string | null) {
  if (!ticket.value || assigneeId === ticket.value.assigneeId) return
  assigning.value = true
  try {
    await patch({ assigneeId }, (t) => (assigneeId ? `Assigned to ${t.assigneeName}` : 'Unassigned'))
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    assigning.value = false
  }
}

const updating = ref<TicketStatus | null>(null)
async function setStatus(status: TicketStatus) {
  updating.value = status
  try {
    await patch({ status }, () => `Marked ${status.toLowerCase()}`)
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    updating.value = null
  }
}

// --- Visibility ---
const confirmPublish = ref(false)
const changingVisibility = ref(false)
async function setVisibility(visibility: TicketVisibility) {
  changingVisibility.value = true
  try {
    await patch({ visibility }, () => (visibility === 'public' ? 'Published: anyone with the link can see it' : 'Made private'))
    confirmPublish.value = false
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    changingVisibility.value = false
  }
}
async function copyPublicLink() {
  await navigator.clipboard.writeText(publicLink.value)
  toast.add({ title: 'Public link copied', icon: 'i-lucide-copy-check' })
}

// --- Following ---
const following = ref(false)
async function toggleFollow() {
  if (!ticket.value) return
  following.value = true
  try {
    const state = await $fetch<{ watching: boolean; watcherCount: number }>(`/api/tickets/${id.value}/watch`, {
      method: ticket.value.watching ? 'DELETE' : 'POST',
    })
    Object.assign(ticket.value, state)
    toast.add({ title: state.watching ? 'Following: you will be notified of updates' : 'Unfollowed', icon: state.watching ? 'i-lucide-bell-ring' : 'i-lucide-bell-off' })
  } catch (e) {
    toast.add({ title: errorMessage(e), color: 'error' })
  } finally {
    following.value = false
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
if (staff.value) await refreshProjects()
const handingOff = ref(false)
const handOffItems = computed(() => projects.value.map((p) => ({ label: p.name, suffix: p.key, onSelect: () => createTask(p.key) })))
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
              <UBadge v-if="isPublic" color="info" variant="soft" icon="i-lucide-globe" label="Public" />
              <UBadge v-else-if="internal" color="neutral" variant="soft" icon="i-lucide-lock" label="Private" />
            </div>

            <form v-if="editingTitle" class="flex items-center gap-2" @submit.prevent="saveTitle">
              <UInput
                v-model="titleDraft"
                :maxlength="140"
                autofocus
                size="lg"
                class="flex-1"
                aria-label="Ticket title"
                @keydown.esc="editingTitle = false"
              />
              <UButton type="submit" icon="i-lucide-check" aria-label="Save title" :loading="savingTitle" />
              <UButton color="neutral" variant="ghost" icon="i-lucide-x" aria-label="Cancel editing" @click="editingTitle = false" />
            </form>
            <div v-else class="group flex items-start gap-2">
              <h1 class="min-w-0 text-xl font-semibold break-words text-highlighted">{{ ticket.title }}</h1>
              <UButton
                v-if="staff"
                icon="i-lucide-pencil"
                size="xs"
                color="neutral"
                variant="ghost"
                aria-label="Edit title"
                class="mt-0.5 opacity-60 group-hover:opacity-100"
                @click="editTitle"
              />
            </div>

            <p class="text-base leading-relaxed whitespace-pre-wrap break-words text-default">{{ ticket.info }}</p>
            <AttachmentGrid :attachments="ticket.attachments" />
          </section>

          <UAlert
            v-if="ticket.conversationId"
            color="neutral"
            variant="subtle"
            icon="i-lucide-messages-square"
            title="Opened from a support conversation"
            :actions="[{ label: 'Open conversation', to: `/conversations?c=${ticket.conversationId}`, color: 'neutral', variant: 'outline', trailingIcon: 'i-lucide-arrow-right' }]"
          />

          <section class="space-y-6">
            <h2 class="flex flex-wrap items-center gap-2 text-sm font-semibold text-highlighted">
              <UIcon name="i-lucide-messages-square" class="size-4" />
              Activity
              <UBadge :label="String(publicCount)" color="neutral" variant="subtle" size="sm" />
              <UBadge v-if="noteCount" :label="`${noteCount} internal`" color="warning" variant="soft" size="sm" icon="i-lucide-lock" />
            </h2>

            <p v-if="!thread.length" class="text-sm text-muted">
              {{ canReply ? 'No comments yet. Add context, ask a question, or attach a document.' : 'No comments yet.' }}
            </p>
            <div v-else class="space-y-6">
              <CommentItem
                v-for="comment in thread"
                :key="comment.id"
                :comment="comment"
                :endpoint="`/api/tickets/${ticket.id}/comments`"
                :people="people"
                :readonly="!canReply"
                :team-badges="!internal"
                :allow-internal="staff"
                @posted="addComment"
                @deleted="removeComment"
              />
            </div>

            <CommentComposer
              v-if="canReply"
              :endpoint="`/api/tickets/${ticket.id}/comments`"
              :people="people"
              :allow-internal="staff"
              :submit-label="staff ? 'Reply' : 'Comment'"
              :placeholder="staff && isPublic ? 'Reply publicly… anyone with the link can read this' : undefined"
              @posted="addComment"
            />
            <UAlert
              v-else
              color="neutral"
              variant="subtle"
              icon="i-lucide-eye"
              :title="internal ? 'You have read-only access' : 'Replies are closed for you on this ticket'"
              :description="internal ? 'Viewers can follow tickets but not reply or change them.' : undefined"
            />
          </section>
        </div>

        <aside class="space-y-6 lg:sticky lg:top-0 lg:self-start">
          <UCard variant="subtle">
            <div class="flex items-center justify-between gap-2">
              <UButton
                v-if="canFollow"
                :icon="ticket.watching ? 'i-lucide-bell-off' : 'i-lucide-bell'"
                :label="ticket.watching ? 'Unfollow' : 'Follow'"
                :color="ticket.watching ? 'neutral' : 'primary'"
                :variant="ticket.watching ? 'outline' : 'soft'"
                size="sm"
                :loading="following"
                @click="toggleFollow"
              />
              <span class="flex items-center gap-1 text-sm text-muted">
                <UIcon name="i-lucide-users" class="size-4" />
                {{ ticket.watcherCount }} follower{{ ticket.watcherCount === 1 ? '' : 's' }}
              </span>
            </div>
          </UCard>

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
                  {{ isReporter ? `${ticket.creatorName ?? 'You'} (you)` : (ticket.creatorName ?? 'Unknown') }}
                </dd>
              </div>
              <div>
                <dt class="flex items-center justify-between text-muted">
                  Assignee
                  <UButton
                    v-if="staff && ticket.assigneeId !== user?.id"
                    size="xs"
                    variant="link"
                    color="primary"
                    label="Assign to me"
                    class="p-0"
                    :loading="assigning"
                    @click="assign(user!.id)"
                  />
                </dt>
                <dd class="mt-1">
                  <USelectMenu
                    v-if="staff"
                    :model-value="ticket.assigneeId"
                    :items="staffItems"
                    value-key="value"
                    :search-input="{ placeholder: 'Find a teammate…' }"
                    :loading="assigning"
                    class="w-full"
                    aria-label="Assign ticket"
                    @update:model-value="(v: string | null) => assign(v)"
                  />
                  <span v-else class="flex items-center gap-2 text-highlighted">
                    <UAvatar v-if="ticket.assigneeName" :text="initials(ticket.assigneeName)" size="2xs" />
                    {{ ticket.assigneeName ?? 'Not picked up yet' }}
                  </span>
                </dd>
              </div>
              <div>
                <dt class="text-muted">Opened</dt>
                <dd class="mt-0.5 text-highlighted">{{ formatDateTime(ticket.createdAt) }}</dd>
              </div>
              <div v-if="ticket.publishedAt && isPublic">
                <dt class="text-muted">Published</dt>
                <dd class="mt-0.5 text-highlighted">{{ formatDateTime(ticket.publishedAt) }}</dd>
              </div>
              <div v-if="ticket.resolvedAt">
                <dt class="text-muted">{{ ticket.status === 'Closed' ? 'Closed' : 'Resolved' }}</dt>
                <dd class="mt-0.5 text-highlighted">{{ formatDateTime(ticket.resolvedAt) }}</dd>
              </div>
            </dl>
          </UCard>

          <UCard v-if="staff || isPublic" variant="subtle">
            <p class="mb-1 flex items-center gap-2 text-sm font-medium text-highlighted">
              <UIcon :name="isPublic ? 'i-lucide-globe' : 'i-lucide-lock'" class="size-4" :class="isPublic ? 'text-info' : 'text-muted'" />
              {{ isPublic ? 'Public' : 'Private' }}
            </p>
            <p class="mb-3 text-xs text-muted">
              {{ isPublic ? 'Listed on the public issues page. Anyone with the link can read it; internal notes stay hidden.' : 'Only the reporter and the team can see this ticket.' }}
            </p>
            <div class="flex flex-col gap-2">
              <UButton v-if="isPublic" icon="i-lucide-link" label="Copy public link" color="neutral" variant="outline" size="sm" block @click="copyPublicLink" />
              <UButton v-if="isPublic" :to="`/issues/${ticket.reference}`" icon="i-lucide-external-link" label="View public page" color="neutral" variant="ghost" size="sm" block />
              <template v-if="staff">
                <UButton
                  v-if="!isPublic"
                  icon="i-lucide-globe"
                  label="Make public"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  block
                  @click="confirmPublish = true"
                />
                <UButton
                  v-else
                  icon="i-lucide-lock"
                  label="Make private"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  block
                  :loading="changingVisibility"
                  @click="setVisibility('private')"
                />
              </template>
            </div>
          </UCard>

          <UCard v-if="internal && (ticket.tasks.length || (staff && projects.length))" variant="subtle">
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
            <UDropdownMenu v-if="staff && projects.length" :items="handOffItems" :content="{ align: 'start' }">
              <UButton icon="i-lucide-folder-input" label="Create task in…" color="neutral" variant="outline" size="sm" block :loading="handingOff" />
            </UDropdownMenu>
          </UCard>

          <UCard v-if="staff" variant="subtle">
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
            <template v-if="admin">
              <USeparator class="my-4" />
              <UButton color="error" variant="ghost" icon="i-lucide-trash-2" label="Delete ticket" block size="sm" @click="confirmDelete = true" />
            </template>
          </UCard>
        </aside>
      </div>

      <UModal v-model:open="confirmPublish" title="Make this ticket public?">
        <template #body>
          <div class="space-y-3 text-sm">
            <p>Anyone with the link, including people without an account, will be able to read:</p>
            <ul class="list-inside list-disc space-y-1 text-muted">
              <li>the title, description and attached files</li>
              <li>every reply that is not an internal note, with the authors' names</li>
              <li>the reporter's name, status, urgency and the assignee's name</li>
            </ul>
            <p class="flex items-start gap-2 rounded-md bg-amber-50 p-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              <UIcon name="i-lucide-lock" class="mt-0.5 size-4 shrink-0" />
              Internal notes stay visible to the team only.
            </p>
            <p class="text-muted">It will also be listed on the public issues page, and signed-in people can follow it and reply.</p>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Keep private" @click="confirmPublish = false" />
            <UButton icon="i-lucide-globe" label="Make public" :loading="changingVisibility" @click="setVisibility('public')" />
          </div>
        </template>
      </UModal>

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
