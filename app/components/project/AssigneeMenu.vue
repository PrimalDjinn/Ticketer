<script setup lang="ts">
/** Avatar button that opens a member picker: quick (re)assignment from board cards and list rows. */
const props = defineProps<{ task: TaskDTO; members: PublicUser[]; readonly?: boolean; size?: '2xs' | 'xs' }>()
const emit = defineEmits<{ assign: [assigneeId: string | null] }>()
const { user } = useUserSession()

const assignee = computed(() => props.members.find((m) => m.id === props.task.assigneeId) ?? null)
const items = computed(() => {
  const me = props.members.find((m) => m.id === user.value?.id)
  const others = props.members.filter((m) => m.id !== me?.id)
  return [
    [
      ...(me && me.id !== props.task.assigneeId ? [{ label: 'Assign to me', icon: 'i-lucide-user-check', onSelect: () => emit('assign', me.id) }] : []),
      ...(props.task.assigneeId ? [{ label: 'Unassign', icon: 'i-lucide-user-x', onSelect: () => emit('assign', null) }] : []),
    ],
    others.map((m) => ({
      label: m.name,
      avatar: { text: initials(m.name), size: '2xs' as const },
      type: 'checkbox' as const,
      checked: m.id === props.task.assigneeId,
      onUpdateChecked: () => emit('assign', m.id),
    })),
  ].filter((group) => group.length)
})
const label = computed(() => (assignee.value ? `Assigned to ${assignee.value.name}` : 'Unassigned'))
</script>

<template>
  <UAvatar v-if="readonly && assignee" :text="initials(assignee.name)" :size="size ?? '2xs'" :title="label" />
  <UDropdownMenu v-else-if="!readonly" :items="items" :content="{ align: 'end' }" :ui="{ content: 'max-h-72 w-52' }">
    <button
      type="button"
      class="relative z-1 grid shrink-0 place-items-center rounded-full transition hover:ring-2 hover:ring-primary/40 focus-visible:outline-2 focus-visible:outline-primary"
      :aria-label="`${label}. Change assignee`"
      :title="label"
      @click.stop
    >
      <UAvatar v-if="assignee" :text="initials(assignee.name)" :size="size ?? '2xs'" />
      <span v-else class="grid size-5 place-items-center rounded-full border border-dashed border-accented text-dimmed">
        <UIcon name="i-lucide-user-plus" class="size-3" />
      </span>
    </button>
  </UDropdownMenu>
</template>
