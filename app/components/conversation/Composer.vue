<script setup lang="ts">
/**
 * Message box for support conversations and direct messages: Enter sends, Shift+Enter adds a line, files attach by
 * button, paste or drop. With `allowInternal` the team can switch between a reply and an internal note.
 */
const props = withDefaults(
  defineProps<{
    send: (input: { body: string; files: File[]; internal: boolean }) => Promise<unknown>
    allowInternal?: boolean
    /** Who reads a reply (not a note), for the warning, e.g. the customer's name. */
    audience?: string
    placeholder?: string
    disabled?: boolean
    autofocus?: boolean
    /** Smaller paddings for the chat popover. */
    compact?: boolean
  }>(),
  { placeholder: 'Write a message…' },
)

const toast = useToast()
const body = ref('')
const files = ref<File[]>([])
// The team starts on an internal note: replying to the customer is the deliberate choice (shown in amber).
const internal = ref(!!props.allowInternal)
const outward = computed(() => !!props.allowInternal && !internal.value)
const pending = ref(0)
const sending = computed(() => pending.value > 0)
const dragging = ref(false)
const chips = useTemplateRef<{ add: (list: FileList | null) => void }>('chips')
const textarea = useTemplateRef<{ textareaRef: HTMLTextAreaElement }>('textarea')

const canSend = computed(() => !props.disabled && (!!body.value.trim() || files.value.length > 0))

/** Clears the box at once so the next message can be typed; puts the text back if sending fails. */
async function submit() {
  if (!canSend.value) return
  const sent = { body: body.value, files: files.value, internal: !!props.allowInternal && internal.value }
  body.value = ''
  files.value = []
  // Every message starts as a note again: a reply to the customer is chosen each time.
  if (props.allowInternal) internal.value = true
  pending.value++
  try {
    await props.send(sent)
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Message not sent') })
    if (!body.value) {
      body.value = sent.body
      internal.value = sent.internal
    }
    if (!files.value.length) files.value = sent.files
  } finally {
    pending.value--
    nextTick(() => textarea.value?.textareaRef?.focus())
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    submit()
  }
}

function onPaste(event: ClipboardEvent) {
  if (event.clipboardData?.files.length) chips.value?.add(event.clipboardData.files)
}

function onDrop(event: DragEvent) {
  dragging.value = false
  chips.value?.add(event.dataTransfer?.files ?? null)
}

defineExpose({ focus: () => textarea.value?.textareaRef?.focus() })
</script>

<template>
  <div
    class="relative rounded-lg ring transition"
    :class="[outward ? 'bg-warning/5 ring-warning/50' : internal && allowInternal ? 'bg-elevated/40 ring-default' : 'bg-default ring-default', dragging ? 'ring-primary' : '']"
    @dragover.prevent="dragging = true"
    @dragleave="dragging = false"
    @drop.prevent="onDrop"
  >
    <div v-if="allowInternal" class="flex items-center gap-1 border-b px-1.5 pt-1.5 pb-1" :class="outward ? 'border-warning/30' : 'border-default'" role="radiogroup" aria-label="Message type">
      <UButton
        size="xs"
        :color="internal ? 'primary' : 'neutral'"
        :variant="internal ? 'soft' : 'ghost'"
        icon="i-lucide-lock"
        label="Internal note"
        role="radio"
        :aria-checked="internal"
        @click="internal = true"
      />
      <UButton
        size="xs"
        :color="outward ? 'warning' : 'neutral'"
        :variant="outward ? 'soft' : 'ghost'"
        icon="i-lucide-reply"
        label="Reply"
        role="radio"
        :aria-checked="!internal"
        @click="internal = false"
      />
      <span v-if="internal" class="ml-auto hidden pr-1 text-[11px] text-muted sm:inline">Only the team sees notes</span>
      <span v-else class="ml-auto pr-1 text-[11px] font-medium text-warning">{{ audience ?? 'The customer' }} will see this</span>
    </div>
    <UTextarea
      ref="textarea"
      v-model="body"
      :rows="compact ? 1 : 2"
      autoresize
      :maxrows="compact ? 5 : 10"
      variant="none"
      :placeholder="internal && allowInternal ? 'Write a note for the team…' : placeholder"
      :disabled="disabled"
      :autofocus="autofocus"
      class="w-full"
      :ui="{ base: compact ? 'px-2.5 py-2' : 'px-3 py-2.5' }"
      aria-label="Message"
      @keydown="onKeydown"
      @paste="onPaste"
    />
    <div class="flex items-center gap-2 px-1.5 pb-1.5">
      <FileChips ref="chips" v-model="files" :disabled="disabled" class="flex-1" />
      <span v-if="!compact" class="hidden text-[11px] text-dimmed sm:inline">Enter to send · Shift+Enter for a new line</span>
      <UButton
        :icon="internal && allowInternal ? 'i-lucide-lock' : 'i-lucide-send-horizontal'"
        :color="outward ? 'warning' : 'primary'"
        size="sm"
        :label="compact ? undefined : internal && allowInternal ? 'Add note' : 'Send'"
        :loading="sending"
        :disabled="!canSend"
        :aria-label="internal && allowInternal ? 'Add note' : 'Send'"
        @click="submit"
      />
    </div>
  </div>
</template>
