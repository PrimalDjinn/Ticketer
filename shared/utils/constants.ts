// Values shared by the Vue app and the Nitro server (auto-imported from `shared/utils`).

export const TICKET_STATUSES = ['Open', 'Pending', 'Resolved', 'Closed'] as const
export const TICKET_URGENCIES = ['Default', 'Urgent', 'Emergency'] as const
export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const
export const USER_ROLES = ['admin', 'member', 'viewer', 'external'] as const
/** People on the team. Everyone else (external accounts and guests) only sees their own and public tickets. */
export const INTERNAL_ROLES = ['admin', 'member', 'viewer'] as const
/** Internal people who may change things (tasks, tickets, support conversations); viewers are read-only. */
export const STAFF_ROLES = ['admin', 'member'] as const
/** Who may create an account without an invitation: nobody, or anyone (joining with that role). */
export const SIGNUP_MODES = ['invite', 'external', 'viewer', 'member'] as const
export const TICKET_VISIBILITIES = ['private', 'public'] as const
export const CONVERSATION_STATUSES = ['open', 'closed'] as const
/** How long an invitation link stays valid. */
export const INVITE_TTL_DAYS = 7
export const TASK_REPEATS = ['daily', 'weekly', 'monthly', 'yearly', 'periodically'] as const
export const FIELD_TYPES = ['text', 'number', 'date', 'select', 'multiselect', 'checkbox'] as const
/** As seen from the task you are looking at. */
export const RELATION_KINDS = ['blocks', 'blocked_by', 'relates'] as const

/** Colour names map to Nuxt UI / Tailwind palettes. */
export const PALETTE = ['neutral', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const

export const DEFAULT_WORKFLOW = [
  { name: 'To do', color: 'neutral', isDone: false },
  { name: 'In progress', color: 'blue', isDone: false },
  { name: 'In review', color: 'amber', isDone: false },
  { name: 'Done', color: 'green', isDone: true },
] as const

/** Upload limits applied to ticket, comment and chat attachments. */
export const UPLOAD_LIMITS = {
  maxFiles: 10,
  maxSize: '32MB',
  maxBytes: 32 * 1024 * 1024,
} as const

/** Channels a connection is subscribed to; derived on the server from the session, never from the client. */
export const channels = {
  all: 'all',
  admins: 'admins',
  /** Internal people (admin, member, viewer): project, task, ticket and support-inbox activity. */
  members: 'members',
  user: (id: string) => `user:${id}`,
}
