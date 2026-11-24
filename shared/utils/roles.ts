// Role checks shared by the app and the server (auto-imported from `shared/utils`).

type RoleHolder = { role: UserRole; isGuest?: boolean } | null | undefined

/** On the team: admin, member or viewer, with a real account. */
export function isInternal(user: RoleHolder) {
  return !!user && !user.isGuest && INTERNAL_ROLES.some((role) => role === user.role)
}

/** On the team and allowed to change things: admin or member. */
export function isStaff(user: RoleHolder) {
  return !!user && !user.isGuest && STAFF_ROLES.some((role) => role === user.role)
}

export const roleMeta: Record<UserRole, { label: string; description: string; internal: boolean; icon: string }> = {
  admin: { label: 'Admin', description: 'Manages people, projects and support', internal: true, icon: 'i-lucide-shield' },
  member: { label: 'Member', description: 'Works on tasks, tickets and support chats', internal: true, icon: 'i-lucide-user' },
  viewer: { label: 'Viewer', description: 'Internal, read-only', internal: true, icon: 'i-lucide-eye' },
  external: { label: 'External', description: 'Outside the team: their own and public tickets, support chat', internal: false, icon: 'i-lucide-globe' },
}

/** "an admin", "a member", "an external user"… */
export function rolePhrase(role: UserRole) {
  return { admin: 'an admin', member: 'a member', viewer: 'a viewer', external: 'an external user' }[role]
}
