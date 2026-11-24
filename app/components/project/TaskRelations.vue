<script setup lang="ts">
import type { CommandPaletteGroup, CommandPaletteItem, TabsItem } from '@nuxt/ui'
import { useDebounceFn } from '@vueuse/core'

/** "Blocks / Blocked by / Related to" links of a task, with a picker that searches tasks across projects. */
const props = defineProps<{
  task: TaskDetailDTO
  readonly?: boolean
  /** Open linked tasks in place (emits `open`) instead of following the link. */
  inPlace?: boolean
}>()
const emit = defineEmits<{ open: [id: number]; changed: [relations: TaskRelationDTO[]] }>()

interface SearchHit {
  id: number
  ref: string
  title: string
  projectKey: string
  number: number
}

const toast = useToast()

const GROUPS: { kind: RelationKind; label: string; icon: string }[] = [
  { kind: 'blocked_by', label: 'Blocked by', icon: 'i-lucide-octagon-x' },
  { kind: 'blocks', label: 'Blocks', icon: 'i-lucide-octagon-alert' },
  { kind: 'relates', label: 'Related to', icon: 'i-lucide-link-2' },
]
const groups = computed(() =>
  GROUPS.map((g) => ({ ...g, items: props.task.relations.filter((r) => r.kind === g.kind) })).filter((g) => g.items.length),
)

const link = (r: TaskRelationDTO) => `/projects/${r.task.projectKey}/${r.task.number}`
function openRelated(event: MouseEvent, r: TaskRelationDTO) {
  if (!props.inPlace || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
  event.preventDefault()
  emit('open', r.task.id)
}

const removing = ref<number | null>(null)
async function remove(r: TaskRelationDTO) {
  removing.value = r.id
  try {
    emit('changed', await $fetch<TaskRelationDTO[]>(`/api/tasks/${props.task.id}/relations/${r.id}`, { method: 'DELETE' }))
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not remove the link') })
  } finally {
    removing.value = null
  }
}

// --- picker -------------------------------------------------------------------------------------------------------
const pickerOpen = ref(false)
const kind = ref<RelationKind>('blocked_by')
const kindTabs: TabsItem[] = [
  { label: 'Blocked by', value: 'blocked_by' },
  { label: 'Blocks', value: 'blocks' },
  { label: 'Relates to', value: 'relates' },
]
const searchTerm = ref('')
const hits = ref<SearchHit[]>([])
const searching = ref(false)
const adding = ref(false)
let searchSeq = 0

async function runSearch() {
  const seq = ++searchSeq
  searching.value = true
  try {
    const result = await $fetch<SearchHit[]>('/api/tasks/search', { query: { q: searchTerm.value.trim(), exclude: props.task.id } })
    if (seq === searchSeq) hits.value = result
  } catch (e) {
    if (seq === searchSeq) toast.add({ color: 'error', title: errorMessage(e, 'Could not search tasks') })
  } finally {
    if (seq === searchSeq) searching.value = false
  }
}
const debouncedSearch = useDebounceFn(runSearch, 200)
watch(searchTerm, () => debouncedSearch())
watch(pickerOpen, (isOpen) => {
  if (!isOpen) return
  searchTerm.value = ''
  hits.value = []
  runSearch()
})

const linkedIds = computed(() => new Set(props.task.relations.map((r) => r.task.id)))
const paletteGroups = computed<CommandPaletteGroup<CommandPaletteItem>[]>(() => [
  {
    id: 'tasks',
    ignoreFilter: true,
    items: hits.value.map((hit) => ({
      label: hit.title,
      prefix: hit.ref,
      suffix: linkedIds.value.has(hit.id) ? 'already linked' : hit.projectKey !== props.task.project.key ? hit.projectKey : undefined,
      disabled: linkedIds.value.has(hit.id) || adding.value,
      onSelect: () => add(hit),
    })),
  },
])

async function add(hit: SearchHit) {
  if (adding.value) return
  adding.value = true
  try {
    emit('changed', await $fetch<TaskRelationDTO[]>(`/api/tasks/${props.task.id}/relations`, { method: 'POST', body: { targetId: hit.id, kind: kind.value } }))
    pickerOpen.value = false
  } catch (e) {
    toast.add({ color: 'error', title: errorMessage(e, 'Could not link the tasks') })
  } finally {
    adding.value = false
  }
}
</script>

<template>
  <section v-if="task.relations.length || !readonly" class="space-y-2" aria-labelledby="relations-heading">
    <div class="flex items-center gap-2">
      <h2 id="relations-heading" class="text-sm font-semibold text-highlighted">Relations</h2>
      <span v-if="task.relations.length" class="text-xs text-muted tabular-nums">{{ task.relations.length }}</span>
      <UPopover v-if="!readonly" v-model:open="pickerOpen" :content="{ align: 'end' }">
        <UButton icon="i-lucide-link-2" size="xs" color="neutral" variant="ghost" label="Add relation" class="ms-auto" />
        <template #content>
          <div class="flex w-[min(26rem,calc(100vw-2rem))] flex-col">
            <div class="border-b border-default px-2 pt-2 pb-1">
              <p id="relation-kind-label" class="sr-only">This task</p>
              <UTabs v-model="kind" :items="kindTabs" :content="false" size="xs" class="w-full" aria-labelledby="relation-kind-label" />
            </div>
            <UCommandPalette
              v-model:search-term="searchTerm"
              :groups="paletteGroups"
              :loading="searching"
              placeholder="Search by title or KEY-12…"
              autofocus
              :close="false"
              class="h-80"
              :ui="{ input: '[&>input]:h-10', itemLabelPrefix: 'font-mono text-xs text-muted', itemLabelSuffix: 'text-xs' }"
            >
              <template #empty>
                <p class="py-6 text-center text-sm text-muted">{{ searching ? 'Searching…' : 'No matching tasks' }}</p>
              </template>
            </UCommandPalette>
          </div>
        </template>
      </UPopover>
    </div>

    <p v-if="!task.relations.length" class="text-sm text-dimmed">Link tasks that block this one, that it blocks, or that are related.</p>
    <div v-else class="space-y-3">
      <div v-for="group in groups" :key="group.kind" class="space-y-1">
        <p class="flex items-center gap-1.5 text-xs font-medium text-muted">
          <UIcon :name="group.icon" class="size-3.5" :class="group.kind === 'blocked_by' && 'text-error'" />
          {{ group.label }}
        </p>
        <ul class="divide-y divide-default rounded-lg ring ring-default">
          <li v-for="r in group.items" :key="r.id" class="group/rel flex items-center gap-2 px-2 py-1.5">
            <NuxtLink
              :to="link(r)"
              class="flex min-w-0 flex-1 items-center gap-2 rounded text-sm hover:text-highlighted focus-visible:outline-2 focus-visible:outline-primary"
              @click.capture="openRelated($event, r)"
            >
              <span class="size-2 shrink-0 rounded-full" :class="color(r.task.statusColor).dot" :title="r.task.status" />
              <span class="sr-only">{{ r.task.status }}:</span>
              <span class="shrink-0 font-mono text-xs text-muted">{{ r.task.ref }}</span>
              <span class="truncate" :class="r.task.isDone ? 'text-muted line-through decoration-muted' : 'text-default'">{{ r.task.title }}</span>
            </NuxtLink>
            <UButton
              v-if="!readonly"
              icon="i-lucide-x"
              size="xs"
              color="neutral"
              variant="ghost"
              :loading="removing === r.id"
              :aria-label="`Remove link to ${r.task.ref}`"
              class="opacity-0 group-hover/rel:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
              @click="remove(r)"
            />
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
