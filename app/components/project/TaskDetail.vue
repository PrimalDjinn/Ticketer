<script setup lang="ts">
import type { DropdownMenuItem, TabsItem } from '@nuxt/ui'
import { useDebounceFn } from '@vueuse/core'
import type { CommentNode } from '~/components/CommentItem.vue'
import type { TaskPatch } from './TaskProperties.vue'

/** Task detail, used by the slide-over (`compact`) and the full task page. Pass `taskId`, or `projectKey` and `number`. */
const props = defineProps<{ taskId?: number; projectKey?: string; number?: number; compact?: boolean }>()
const emit = defineEmits<{ deleted: []; open: [id: number] }>()

const { user } = useUserSession()
const toast = useToast()
const canEdit = computed(() => user.value?.role === 'admin' || user.value?.role === 'member')

// --- data ---------------------------------------------------------------------------------------------------------
const url = computed(() => (props.taskId ? `/api/tasks/${props.taskId}` : `/api/projects/${props.projectKey}/tasks/${props.number}`))
// deep: property edits, realtime events and comments patch the task in place.
const { data: task, error, refresh } = useFetch<TaskDetailDTO>(url, { deep: true })

const projectKey = computed(() => task.value?.project.key ?? props.projectKey ?? '')
const requestFetch = useRequestFetch()
// The board payload carries the columns, labels and people for the pickers.
const { data: board, refresh: refreshBoard } = useAsyncData(
  () => `task-detail-board-${projectKey.value}`,
  () => (projectKey.value ? requestFetch<ProjectBoardDTO>(`/api/projects/${projectKey.value}`) : Promise.resolve(null)),
  { deep: true },
)

const statuses = computed(() => [...(board.value?.project.statuses ?? [])].sort((a, b) => a.position - b.position))
const labels = computed(() => board.value?.labels ?? [])
const members = computed(() => board.value?.members ?? [])
const status = computed(() => statuses.value.find((s) => s.id === task.value?.statusId))
const projectColor = computed(() => board.value?.project.color ?? task.value?.project.color)
const fullLink = computed(() => (task.value ? `/projects/${task.value.project.key}/${task.value.number}` : ''))
const parentLink = computed(() => {
  const parent = task.value?.parent
  return parent ? `/projects/${task.value!.project.key}/${parent.ref.slice(parent.ref.lastIndexOf('-') + 1)}` : ''
})
const fields = computed(() => board.value?.project.fields ?? [])
const openBlockers = computed(() => (task.value?.relations ?? []).filter((r) => r.kind === 'blocked_by' && !r.task.isDone))
const repeatText = computed(() => (task.value ? repeatLabel(task.value.repeat, task.value.repeatInterval) : ''))

function onRelationsChanged(relations: TaskRelationDTO[]) {
  const current = task.value
  if (!current) return
  current.relations = relations
  current.blockedByCount = relations.filter((r) => r.kind === 'blocked_by' && !r.task.isDone).length
  syncExtras()
}

const commentsEndpoint = computed(() => `/api/tasks/${task.value?.id}/comments`)

// Fields that change outside TaskDTO (activity, files, subtasks, description) are re-read in one go after changes.
const syncExtras = useDebounceFn(async () => {
  const current = task.value
  if (!current) return
  try {
    const fresh = await $fetch<TaskDetailDTO>(`/api/tasks/${current.id}`)
    if (task.value?.id !== fresh.id) return
    task.value.activity = fresh.activity
    task.value.attachments = fresh.attachments
    task.value.subtasks = fresh.subtasks
    task.value.parent = fresh.parent
    task.value.relations = fresh.relations
    task.value.blockedByCount = fresh.blockedByCount
    if (!editingDescription.value) task.value.description = fresh.description
  } catch {
    // The next realtime event or resync will catch up.
  }
}, 400)

// --- editing ------------------------------------------------------------------------------------------------------
async function patch(body: TaskPatch) {
  const current = task.value
  if (!current || !canEdit.value) return
  const { fields, ...plain } = body
  const before: Record<string, unknown> = {}
  for (const key of Object.keys(plain) as (keyof typeof plain)[]) before[key] = current[key]
  Object.assign(current, plain)
  if (fields) {
    before.fieldValues = current.fieldValues
    const values = { ...current.fieldValues }
    for (const [id, value] of Object.entries(fields)) {
      if (value === null) delete values[Number(id)]
      else values[Number(id)] = value
    }
    current.fieldValues = values
  }
  try {
    const updated = await $fetch<TaskDTO>(`/api/tasks/${current.id}`, { method: 'PATCH', body })
    Object.assign(current, updated)
    syncExtras()
  } catch (e) {
    Object.assign(current, before)
    toast.add({ color: 'error', title: errorMessage(e, 'Could not update the task') })
  }
}

const editingTitle = ref(false)
const titleDraft = ref('')
function editTitle() {
  if (!canEdit.value || !task.value) return
  titleDraft.value = task.value.title
  editingTitle.value = true
}
function saveTitle() {
  if (!editingTitle.value) return
  editingTitle.value = false
  const value = titleDraft.value.trim()
  if (value && value !== task.value?.title) patch({ title: value })
}
function onTitleKey(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    saveTitle()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation() // keep the slide-over open
    editingTitle.value = false
  }
}

const editingDescription = ref(false)
const descriptionDraft = ref('')
function editDescription(event?: MouseEvent) {
  if (!canEdit.value || !task.value) return
  if (event?.target instanceof HTMLElement && event.target.closest('a')) return // following a link
  if (window.getSelection()?.toString()) return // selecting text to copy
  descriptionDraft.value = task.value.description
  editingDescription.value = true
}
function saveDescription() {
  if (!editingDescription.value) return
  editingDescription.value = false
  if (descriptionDraft.value !== task.value?.description) patch({ description: descriptionDraft.value })
}
function onDescriptionKey(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    saveDescription()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    editingDescription.value = false
  }
}

// Plain text with URLs turned into links; rendered as text nodes and anchors, never as HTML.
const URL_PATTERN = /(https?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]}])/
const descriptionSegments = computed(() =>
  (task.value?.description ?? '').split(URL_PATTERN).map((text, index) => ({ text, link: index % 2 === 1 })),
)

// Reset transient state when the slide-over switches to another task.
watch(url, () => {
  editingTitle.value = false
  editingDescription.value = false
  tab.value = 'comments'
})

async function createLabel(name: string) {
  const current = task.value
  if (!current) return
  try {
    const label = await $fetch<LabelDTO>('/api/labels', { method: 'POST', body: { name, color: PALETTE[Math.floor(Math.random() * (PALETTE.length - 1)) + 1] } })
    if (board.value && !board.value.labels.some((l) => l.id === label.id)) board.value.labels.push(label)
    await patch({ labelIds: [...current.labelIds, label.id] })
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not create the label') })
  }
}

function upsertSubtask(sub: TaskDTO) {
  const current = task.value
  if (!current) return
  const index = current.subtasks.findIndex((s) => s.id === sub.id)
  if (index === -1) current.subtasks.push(sub)
  else current.subtasks[index] = sub
}

// --- attachments --------------------------------------------------------------------------------------------------
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')
const uploading = ref(false)
const dragging = ref(false)
async function upload(list: FileList | null | undefined) {
  const current = task.value
  if (!current || !list?.length || !canEdit.value) return
  const files = [...list].filter((file) => {
    if (file.size <= UPLOAD_LIMITS.maxBytes) return true
    toast.add({ color: 'error', title: `${file.name} is larger than ${UPLOAD_LIMITS.maxSize}` })
    return false
  })
  if (fileInput.value) fileInput.value.value = ''
  if (!files.length) return
  if (files.length > UPLOAD_LIMITS.maxFiles) toast.add({ color: 'warning', title: `Only the first ${UPLOAD_LIMITS.maxFiles} files are uploaded` })
  const form = new FormData()
  for (const file of files.slice(0, UPLOAD_LIMITS.maxFiles)) form.append('files', file)
  uploading.value = true
  try {
    const added = await $fetch<AttachmentDTO[]>(`/api/tasks/${current.id}/attachments`, { method: 'POST', body: form })
    for (const a of added) if (!current.attachments.some((x) => x.id === a.id)) current.attachments.push(a)
    syncExtras()
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not upload the files') })
  } finally {
    uploading.value = false
  }
}
function onDrop(event: DragEvent) {
  dragging.value = false
  upload(event.dataTransfer?.files)
}

async function removeAttachment(attachment: AttachmentDTO) {
  const current = task.value
  if (!current) return
  const before = current.attachments
  current.attachments = before.filter((a) => a.id !== attachment.id)
  try {
    await $fetch(`/api/tasks/${current.id}/attachments/${attachment.id}`, { method: 'DELETE' })
    syncExtras()
  } catch (e) {
    current.attachments = before
    toast.add({ color: 'error', title: errorMessage(e, 'Could not remove the file') })
  }
}

// --- comments and activity ----------------------------------------------------------------------------------------
const tab = ref<'comments' | 'activity'>('comments')
const tabs = computed<TabsItem[]>(() => [
  { label: 'Comments', value: 'comments', icon: 'i-lucide-message-square', badge: task.value?.comments.length || undefined },
  { label: 'Activity', value: 'activity', icon: 'i-lucide-history' },
])
const thread = computed<CommentNode[]>(() => commentTree(task.value?.comments ?? []))

function addComment(comment: CommentDTO) {
  const current = task.value
  if (!current || comment.ticketId !== current.id) return
  if (!current.comments.some((c) => c.id === comment.id)) current.comments.push(comment)
}
function removeComment(commentId: number) {
  const current = task.value
  if (!current) return
  const gone = commentThreadIds(current.comments, commentId) // replies go with their parent
  current.comments = current.comments.filter((c) => !gone.has(c.id))
}

// --- realtime -----------------------------------------------------------------------------------------------------
let deletedHere = false
onRealtime('task.updated', (t) => {
  const current = task.value
  if (!current) return
  if (t.id === current.id) {
    const { title, ...rest } = t
    Object.assign(current, rest, editingTitle.value ? {} : { title })
    syncExtras()
  } else if (t.parentId === current.id) {
    upsertSubtask(t)
  } else if (current.subtasks.some((s) => s.id === t.id)) {
    current.subtasks = current.subtasks.filter((s) => s.id !== t.id) // moved to another parent
  }
  if (t.id !== current.id && current.relations.some((r) => r.task.id === t.id)) syncExtras() // a linked task changed status or title
})
onRealtime('task.created', (t) => {
  if (task.value && t.parentId === task.value.id) upsertSubtask(t)
})
onRealtime('task.deleted', ({ id }) => {
  const current = task.value
  if (!current) return
  if (id === current.id) {
    if (!deletedHere) {
      toast.add({ title: `${current.ref} was deleted`, color: 'warning' })
      emit('deleted')
    }
  } else {
    current.subtasks = current.subtasks.filter((s) => s.id !== id)
  }
})
onRealtime('task.comment.created', ({ taskId, ...comment }) => {
  if (taskId === task.value?.id) addComment(comment)
})
onRealtime('task.comment.deleted', ({ id, taskId }) => {
  if (taskId === task.value?.id) removeComment(id)
})
onRealtime('labels.updated', (list) => {
  if (board.value) board.value.labels = list
})
onRealtime('project.updated', (project) => {
  if (board.value && project.id === board.value.project.id) board.value.project = project
  if (task.value && project.id === task.value.projectId) Object.assign(task.value.project, { name: project.name, color: project.color })
})
onRealtimeResync(() => {
  refresh()
  refreshBoard()
})

// --- menu ---------------------------------------------------------------------------------------------------------
async function copyLink() {
  await navigator.clipboard.writeText(new URL(fullLink.value, window.location.origin).href)
  toast.add({ title: 'Link copied', icon: 'i-lucide-link' })
}

const confirmDelete = ref(false)
const deleting = ref(false)
async function deleteTask() {
  const current = task.value
  if (!current) return
  deleting.value = true
  deletedHere = true
  try {
    await $fetch(`/api/tasks/${current.id}`, { method: 'DELETE' })
    confirmDelete.value = false
    toast.add({ title: `${current.ref} deleted`, color: 'success' })
    emit('deleted')
  } catch (e) {
    deletedHere = false
    toast.add({ color: 'error', title: errorMessage(e, 'Could not delete the task') })
  } finally {
    deleting.value = false
  }
}

const menu = computed<DropdownMenuItem[][]>(() => [
  [
    { label: 'Copy link', icon: 'i-lucide-link', onSelect: copyLink },
    ...(props.compact ? [{ label: 'Open full page', icon: 'i-lucide-maximize-2', to: fullLink.value }] : []),
  ],
  ...(canEdit.value ? [[{ label: 'Delete task', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => (confirmDelete.value = true) }]] : []),
])

function openInPlace(event: MouseEvent, id: number) {
  if (!props.compact || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('open', id)
}
</script>

<template>
  <div v-if="error && !task" class="flex h-full items-center justify-center p-6">
    <UEmpty
      icon="i-lucide-search-x"
      title="Task not found"
      :description="errorMessage(error, 'It may have been deleted, or the link is wrong.')"
      :actions="projectKey ? [{ label: 'Back to project', to: `/projects/${projectKey}`, color: 'neutral', variant: 'subtle' }] : []"
    />
  </div>

  <div v-else-if="!task" class="space-y-4 p-1" aria-busy="true">
    <USkeleton class="h-5 w-24" />
    <USkeleton class="h-8 w-3/4" />
    <USkeleton class="h-24 w-full" />
  </div>

  <div v-else class="grid gap-x-10 gap-y-6" :class="compact ? 'grid-cols-1' : 'lg:grid-cols-[minmax(0,1fr)_17rem] lg:grid-rows-[auto_1fr]'">
    <!-- Header -->
    <header class="order-1 min-w-0 space-y-2" :class="!compact && 'lg:col-start-1 lg:row-start-1'">
      <div class="flex items-center gap-2 text-sm">
        <NuxtLink
          :to="fullLink"
          class="inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-0.5 font-mono text-xs font-medium ring ring-inset focus-visible:outline-2 focus-visible:outline-primary"
          :class="[color(projectColor).soft, color(projectColor).text, color(projectColor).ring]"
        >
          <span class="size-1.5 rounded-full" :class="color(projectColor).dot" />
          {{ task.ref }}
        </NuxtLink>
        <UTooltip v-if="task.repeat" :text="`Repeats: ${repeatText.toLowerCase()}`">
          <span class="inline-flex shrink-0 items-center text-primary" tabindex="0" :aria-label="`Repeats ${repeatText.toLowerCase()}`">
            <UIcon name="i-lucide-repeat" class="size-4" />
          </span>
        </UTooltip>
        <template v-if="task.parent">
          <UIcon name="i-lucide-chevron-right" class="size-3.5 shrink-0 text-dimmed" />
          <NuxtLink
            :to="parentLink"
            class="min-w-0 truncate rounded text-muted hover:text-highlighted hover:underline focus-visible:outline-2 focus-visible:outline-primary"
            @click.capture="openInPlace($event, task.parent.id)"
          >
            <span class="font-mono text-xs">{{ task.parent.ref }}</span> {{ task.parent.title }}
          </NuxtLink>
        </template>
        <div class="ms-auto flex shrink-0 items-center gap-1">
          <UTooltip text="Copy link">
            <UButton icon="i-lucide-link" color="neutral" variant="ghost" size="sm" aria-label="Copy link" @click="copyLink" />
          </UTooltip>
          <UTooltip v-if="compact" text="Open full page">
            <UButton :to="fullLink" icon="i-lucide-maximize-2" color="neutral" variant="ghost" size="sm" aria-label="Open full page" />
          </UTooltip>
          <UDropdownMenu :items="menu" :content="{ align: 'end' }">
            <UButton icon="i-lucide-ellipsis" color="neutral" variant="ghost" size="sm" aria-label="Task actions" />
          </UDropdownMenu>
          <slot name="actions" />
        </div>
      </div>

      <UTextarea
        v-if="editingTitle"
        v-model="titleDraft"
        :rows="1"
        autoresize
        autofocus
        variant="none"
        aria-label="Task title"
        class="w-full"
        :ui="{ base: 'p-0 text-xl font-semibold text-highlighted leading-snug resize-none' }"
        @keydown="onTitleKey"
        @blur="saveTitle"
      />
      <h1 v-else class="text-xl leading-snug font-semibold break-words text-highlighted">
        <button
          v-if="canEdit"
          type="button"
          class="-mx-1 w-[calc(100%+0.5rem)] cursor-text rounded px-1 text-left hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
          title="Click to edit"
          @click="editTitle"
        >
          {{ task.title }}
        </button>
        <template v-else>{{ task.title }}</template>
      </h1>

      <UAlert
        v-if="task.blockedByCount > 0 && !status?.isDone"
        color="error"
        variant="subtle"
        icon="i-lucide-octagon-x"
        :title="`Blocked by ${task.blockedByCount} open ${task.blockedByCount === 1 ? 'task' : 'tasks'}`"
        :ui="{ root: 'py-2.5', title: 'text-sm' }"
      >
        <template v-if="openBlockers.length" #description>
          <span class="flex flex-wrap gap-x-3 gap-y-1">
            <NuxtLink
              v-for="r in openBlockers"
              :key="r.id"
              :to="`/projects/${r.task.projectKey}/${r.task.number}`"
              class="inline-flex min-w-0 items-center gap-1 rounded hover:underline focus-visible:outline-2 focus-visible:outline-primary"
              @click.capture="openInPlace($event, r.task.id)"
            >
              <span class="font-mono text-xs">{{ r.task.ref }}</span>
              <span class="max-w-60 truncate">{{ r.task.title }}</span>
            </NuxtLink>
          </span>
        </template>
      </UAlert>
    </header>

    <!-- Main column -->
    <div class="order-3 min-w-0 space-y-6" :class="!compact && 'lg:col-start-1 lg:row-start-2'">
      <!-- Description -->
      <section aria-label="Description">
        <div v-if="editingDescription" class="rounded-lg ring ring-primary">
          <UTextarea
            v-model="descriptionDraft"
            autoresize
            autofocus
            :rows="4"
            :maxrows="30"
            variant="none"
            placeholder="Add more detail…"
            aria-label="Description"
            class="w-full"
            @keydown="onDescriptionKey"
            @blur="saveDescription"
          />
          <p class="border-t border-default px-3 py-1 text-xs text-dimmed">Ctrl + Enter to save · Esc to cancel</p>
        </div>
        <div v-else-if="task.description" class="group relative">
          <!-- Click anywhere to edit; the button below is the keyboard path. -->
          <div
            class="-mx-2 rounded-md px-2 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words text-default"
            :class="canEdit && 'cursor-text hover:bg-elevated/50'"
            @click="editDescription"
          >
            <template v-for="(segment, i) in descriptionSegments" :key="i">
              <a v-if="segment.link" :href="segment.text" target="_blank" rel="noopener noreferrer nofollow" class="text-primary underline-offset-2 hover:underline">{{ segment.text }}</a>
              <template v-else>{{ segment.text }}</template>
            </template>
          </div>
          <UButton
            v-if="canEdit"
            icon="i-lucide-pencil"
            size="xs"
            color="neutral"
            variant="ghost"
            aria-label="Edit description"
            class="absolute -top-1 right-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
            @click="editDescription()"
          />
        </div>
        <button
          v-else-if="canEdit"
          type="button"
          class="-mx-2 w-[calc(100%+1rem)] rounded-md px-2 py-1 text-left text-sm text-dimmed hover:bg-elevated/50 focus-visible:outline-2 focus-visible:outline-primary"
          @click="editDescription()"
        >
          Add a description…
        </button>
        <p v-else class="text-sm text-muted">No description.</p>
      </section>

      <ProjectTaskSubtasks
        :task="task"
        :statuses="statuses"
        :members="members"
        :readonly="!canEdit"
        :in-place="compact"
        @upsert="upsertSubtask"
        @open="(id) => emit('open', id)"
      />

      <ProjectTaskRelations
        :task="task"
        :readonly="!canEdit"
        :in-place="compact"
        @changed="onRelationsChanged"
        @open="(id) => emit('open', id)"
      />

      <!-- Attachments -->
      <section
        v-if="task.attachments.length || canEdit"
        class="space-y-2 rounded-lg"
        :class="dragging && 'ring-2 ring-primary ring-offset-4 ring-offset-(--ui-bg)'"
        aria-labelledby="attachments-heading"
        @dragover.prevent="canEdit && (dragging = true)"
        @dragleave="dragging = false"
        @drop.prevent="onDrop"
      >
        <div class="flex items-center gap-2">
          <h2 id="attachments-heading" class="text-sm font-semibold text-highlighted">Attachments</h2>
          <span v-if="task.attachments.length" class="text-xs text-muted tabular-nums">{{ task.attachments.length }}</span>
          <template v-if="canEdit">
            <input ref="fileInput" type="file" multiple class="hidden" @change="upload(($event.target as HTMLInputElement).files)" />
            <UButton
              icon="i-lucide-paperclip"
              size="xs"
              color="neutral"
              variant="ghost"
              label="Attach"
              class="ms-auto"
              :loading="uploading"
              @click="fileInput?.click()"
            />
          </template>
        </div>
        <div v-if="task.attachments.length" class="flex flex-wrap items-start gap-2">
          <div v-for="attachment in task.attachments" :key="attachment.id" class="group/file relative">
            <AttachmentGrid :attachments="[attachment]" compact />
            <button
              v-if="canEdit"
              type="button"
              class="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-default text-muted opacity-0 shadow ring ring-default transition group-hover/file:opacity-100 hover:text-error focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-primary"
              :aria-label="`Remove ${attachment.name}`"
              @click="removeAttachment(attachment)"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </div>
        </div>
        <p v-else class="text-sm text-dimmed">Drop files here or use Attach (up to {{ UPLOAD_LIMITS.maxSize }} each).</p>
      </section>

      <!-- Comments and activity -->
      <section class="space-y-4">
        <UTabs v-model="tab" :items="tabs" :content="false" variant="link" size="sm" class="w-full" />

        <template v-if="tab === 'comments'">
          <p v-if="!thread.length" class="text-sm text-muted">No comments yet.</p>
          <div v-else class="space-y-5">
            <CommentItem
              v-for="comment in thread"
              :key="comment.id"
              :comment="comment"
              :endpoint="commentsEndpoint"
              :people="members"
              :readonly="!canEdit"
              @posted="addComment"
              @deleted="removeComment"
            />
          </div>
          <CommentComposer v-if="canEdit" :endpoint="commentsEndpoint" :people="members" @posted="addComment" />
        </template>
        <ProjectTaskActivity v-else :activity="task.activity" />
      </section>
    </div>

    <!-- Properties -->
    <aside
      class="order-2 space-y-4"
      :class="compact ? 'rounded-lg bg-elevated/40 p-2 ring ring-default' : 'lg:sticky lg:top-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start'"
    >
      <ProjectTaskProperties
        :task="task"
        :statuses="statuses"
        :labels="labels"
        :members="members"
        :fields="fields"
        :readonly="!canEdit"
        :wide="compact"
        @patch="patch"
        @create-label="createLabel"
      />
      <USeparator />
      <dl class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-x-2 gap-y-1.5 text-xs" :class="compact && 'px-2 pb-1 sm:grid-cols-[6.5rem_minmax(0,1fr)_6.5rem_minmax(0,1fr)]'">
        <dt class="text-muted">Created by</dt>
        <dd class="flex min-w-0 items-center gap-1.5 text-default">
          <UAvatar :text="initials(task.creatorName ?? '?')" size="3xs" />
          <span class="truncate">{{ task.creatorName ?? 'Unknown' }}</span>
        </dd>
        <dt class="text-muted">Created</dt>
        <dd class="text-default"><NuxtTime :datetime="task.createdAt" relative :title="formatDateTime(task.createdAt)" /></dd>
        <template v-if="task.updatedAt">
          <dt class="text-muted">Updated</dt>
          <dd class="text-default"><NuxtTime :datetime="task.updatedAt" relative :title="formatDateTime(task.updatedAt)" /></dd>
        </template>
        <template v-if="task.completedAt && status?.isDone">
          <dt class="text-muted">Completed</dt>
          <dd class="text-success"><NuxtTime :datetime="task.completedAt" relative :title="formatDateTime(task.completedAt)" /></dd>
        </template>
      </dl>
    </aside>

    <UModal v-model:open="confirmDelete" :title="`Delete ${task.ref}?`" description="The task, its subtasks, comments and attached files are removed for good.">
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="ghost" label="Keep it" @click="confirmDelete = false" />
          <UButton color="error" icon="i-lucide-trash-2" label="Delete task" :loading="deleting" @click="deleteTask" />
        </div>
      </template>
    </UModal>
  </div>
</template>
