<script setup lang="ts">
/**
 * Comment box with @mentions and file attachments, shared by tickets and tasks (`endpoint` is the comments URL). Typing `@` opens a picker of people who can see the ticket;
 * Enter/Tab picks the highlighted person, Ctrl/Cmd+Enter posts.
 */
const props = defineProps<{
  endpoint: string
  people: PublicUser[]
  parentId?: number
  placeholder?: string
  autofocus?: boolean
}>()
const emit = defineEmits<{ posted: [comment: CommentDTO]; cancel: [] }>()

const toast = useToast()
const body = ref('')
const files = ref<File[]>([])
const mentioned = ref(new Map<string, PublicUser>())
const sending = ref(false)
const textarea = useTemplateRef<{ textareaRef: HTMLTextAreaElement }>('textarea')
const dragging = ref(false)
const chips = useTemplateRef<{ add: (list: FileList | null) => void }>('chips')

// --- mentions ---------------------------------------------------------------------------------------------------
const query = ref<string | null>(null)
const highlighted = ref(0)
const matches = computed(() => {
  if (query.value === null) return []
  const q = query.value.toLowerCase()
  return props.people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6)
})

function updateQuery() {
  const el = textarea.value?.textareaRef
  if (!el) return
  const before = body.value.slice(0, el.selectionStart)
  const match = /(?:^|\s)@([\w]*)$/.exec(before)
  query.value = match ? match[1]! : null
  highlighted.value = 0
}

function pick(person: PublicUser) {
  const el = textarea.value?.textareaRef
  if (!el) return
  const caret = el.selectionStart
  const before = body.value.slice(0, caret).replace(/@[\w]*$/, `@${person.name} `)
  body.value = before + body.value.slice(caret)
  mentioned.value.set(person.id, person)
  query.value = null
  nextTick(() => {
    el.focus()
    el.setSelectionRange(before.length, before.length)
  })
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    submit()
    return
  }
  if (!matches.value.length) return
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const n = matches.value.length
    highlighted.value = (highlighted.value + (event.key === 'ArrowDown' ? 1 : n - 1)) % n
  } else if (event.key === 'Enter' || event.key === 'Tab') {
    event.preventDefault()
    pick(matches.value[highlighted.value]!)
  } else if (event.key === 'Escape') {
    query.value = null
  }
}

// --- submit -----------------------------------------------------------------------------------------------------
async function submit() {
  if (sending.value || (!body.value.trim() && !files.value.length)) return
  sending.value = true
  try {
    const form = new FormData()
    form.set('body', body.value.trim())
    if (props.parentId) form.set('parentId', String(props.parentId))
    // Only people whose @name is still in the text count as mentioned.
    for (const person of mentioned.value.values()) {
      if (body.value.includes(`@${person.name}`)) form.append('mentions', person.id)
    }
    for (const file of files.value) form.append('files', file)
    const comment = await $fetch<CommentDTO>(props.endpoint, { method: 'POST', body: form })
    body.value = ''
    files.value = []
    mentioned.value = new Map()
    emit('posted', comment)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not post the comment') })
  } finally {
    sending.value = false
  }
}

function onDrop(event: DragEvent) {
  dragging.value = false
  chips.value?.add(event.dataTransfer?.files ?? null)
}

function onPaste(event: ClipboardEvent) {
  if (event.clipboardData?.files.length) {
    event.preventDefault()
    chips.value?.add(event.clipboardData.files)
  }
}
</script>

<template>
  <div
    class="relative rounded-xl bg-default ring ring-default transition focus-within:ring-primary"
    :class="dragging && 'ring-2 ring-primary'"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <UTextarea
      ref="textarea"
      v-model="body"
      :placeholder="placeholder ?? 'Write a comment… use @ to mention someone'"
      :rows="parentId ? 2 : 3"
      autoresize
      :maxrows="14"
      variant="none"
      class="w-full"
      :autofocus="autofocus"
      @input="updateQuery"
      @click="updateQuery"
      @keydown="onKeydown"
      @paste="onPaste"
    />

    <ul
      v-if="matches.length"
      class="absolute bottom-full left-3 z-20 mb-1 w-64 overflow-hidden rounded-lg bg-default py-1 shadow-lg ring ring-default"
      role="listbox"
    >
      <li v-for="(person, index) in matches" :key="person.id" role="option" :aria-selected="index === highlighted">
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm"
          :class="index === highlighted ? 'bg-elevated text-highlighted' : 'text-default'"
          @mousedown.prevent="pick(person)"
          @mouseenter="highlighted = index"
        >
          <UAvatar :text="initials(person.name)" size="2xs" />
          <span class="truncate">{{ person.name }}</span>
          <UBadge v-if="person.isAdmin" label="Support" size="sm" variant="soft" class="ml-auto" />
        </button>
      </li>
    </ul>

    <div class="flex items-center gap-2 border-t border-default px-2 py-1.5">
      <FileChips ref="chips" v-model="files" :disabled="sending" class="flex-1" />
      <span class="hidden text-xs text-dimmed sm:inline">Ctrl + Enter</span>
      <UButton v-if="parentId" size="sm" color="neutral" variant="ghost" label="Cancel" @click="emit('cancel')" />
      <UButton size="sm" :loading="sending" :disabled="!body.trim() && !files.length" :label="parentId ? 'Reply' : 'Comment'" @click="submit" />
    </div>
  </div>
</template>
