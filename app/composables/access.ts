/**
 * What the signed-in person may see and do. Server routes enforce the same rules; this only shapes the UI.
 *  - internal: admin, member or viewer: projects, tasks, every ticket, the support inbox
 *  - staff: admin or member: can change things (viewers are read-only)
 *  - external / guest: their own tickets, public issues and support chat
 */
export function useAccess() {
  const { user, loggedIn } = useUserSession()
  const internal = computed(() => isInternal(user.value))
  const staff = computed(() => isStaff(user.value))
  const admin = computed(() => !!user.value?.isAdmin && !user.value.isGuest)
  const registered = computed(() => loggedIn.value && !user.value?.isGuest)
  return { user, loggedIn, registered, internal, staff, admin }
}
