import { useDocumentVisibility, useIntervalFn } from '@vueuse/core'

/**
 * Keeps a view of public issues current: realtime events for people with a session (the team, outside people and
 * guests), and a gentle once-a-minute refresh while the tab is visible for anonymous visitors, who have no
 * realtime connection.
 */
export function useLivePublicIssues(refresh: () => unknown) {
  onRealtime('issue.published', () => refresh())
  onRealtime('issue.updated', () => refresh())
  onRealtime('issue.removed', () => refresh())
  onRealtimeResync(() => refresh())
  if (import.meta.server) return
  const { loggedIn } = useUserSession()
  const visible = useDocumentVisibility()
  useIntervalFn(() => {
    if (!loggedIn.value && visible.value === 'visible') refresh()
  }, 60_000)
}

/** A toast when an issue is made public, for everyone but the person who published it. Mounted once per layout. */
export function useNewPublicIssueToasts() {
  const toast = useToast()
  const { user } = useUserSession()
  const route = useRoute()
  onRealtime('issue.published', (issue) => {
    if (issue.actorId && issue.actorId === user.value?.id) return
    if (route.path === `/issues/${issue.reference}`) return
    toast.add({
      id: `issue-${issue.reference}`,
      title: 'New public issue',
      description: issue.title,
      icon: 'i-lucide-megaphone',
      color: issue.urgency === 'Default' ? 'info' : 'warning',
      actions: [{ label: 'View', to: `/issues/${issue.reference}`, color: 'neutral', variant: 'outline' }],
    })
  })
}
