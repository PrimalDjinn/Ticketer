import { useDebounceFn } from '@vueuse/core'

/** Project list shared by the sidebar, pickers and the projects page; kept live through realtime events. */
export function useProjects() {
  const projects = useState<ProjectDTO[]>('projects', () => [])
  const loaded = useState('projects-loaded', () => false)
  const { user } = useUserSession()
  // Forwards the visitor's cookies during SSR (a bare $fetch would render the list logged-out, then mismatch).
  const request = useRequestFetch()

  async function refresh() {
    if (!isInternal(user.value)) {
      projects.value = []
      return
    }
    projects.value = await request<ProjectDTO[]>('/api/projects').catch(() => projects.value)
    loaded.value = true
  }

  function upsert(project: ProjectDTO) {
    const index = projects.value.findIndex((p) => p.id === project.id)
    if (index === -1) projects.value = [...projects.value, project].sort((a, b) => a.name.localeCompare(b.name))
    else projects.value = projects.value.map((p) => (p.id === project.id ? project : p))
  }

  return { projects, loaded, refresh, upsert, active: computed(() => projects.value.filter((p) => !p.archivedAt)) }
}

/** Installed once from the default layout. */
export function useProjectsFeed() {
  const { refresh, upsert, projects } = useProjects()
  onRealtime('project.updated', upsert)
  onRealtime('project.deleted', ({ id }) => (projects.value = projects.value.filter((p) => p.id !== id)))
  // Counts in the sidebar follow task changes; a cheap refetch keeps them right.
  const refreshSoon = useDebounceFn(refresh, 800)
  onRealtime('task.created', refreshSoon)
  onRealtime('task.updated', refreshSoon)
  onRealtime('task.deleted', refreshSoon)
  onRealtimeResync(refresh)
  return { refresh }
}
