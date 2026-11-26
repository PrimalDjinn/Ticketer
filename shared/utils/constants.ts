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
/** What happens to tickets a person opened when their account is deleted (see server/utils/accounts.ts). */
export const ACCOUNT_TICKET_MODES = ['keep', 'delete-private', 'delete'] as const
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

/** Bot protection for sign-up and visitor forms (see server/utils/captcha.ts). */
export const CAPTCHA_PROVIDERS = ['turnstile', 'recaptcha'] as const
export type CaptchaProvider = (typeof CAPTCHA_PROVIDERS)[number]
/** Request header carrying the widget's token. */
export const CAPTCHA_HEADER = 'x-captcha-token'

/** Accent colours offered in Settings → Branding (Nuxt UI / Tailwind palette names), with the 600 shade for emails. */
export const ACCENT_COLOR_NAMES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose'] as const
export type AccentColor = (typeof ACCENT_COLOR_NAMES)[number]
export const ACCENT_COLORS: Record<AccentColor, string> = {
  red: '#dc2626',
  orange: '#ea580c',
  amber: '#d97706',
  yellow: '#ca8a04',
  lime: '#65a30d',
  green: '#16a34a',
  emerald: '#059669',
  teal: '#0d9488',
  cyan: '#0891b2',
  sky: '#0284c7',
  blue: '#2563eb',
  indigo: '#4f46e5',
  violet: '#7c3aed',
  purple: '#9333ea',
  fuchsia: '#c026d3',
  pink: '#db2777',
  rose: '#e11d48',
}

/**
 * What a personal access token may do (`resource:read|write`). A call needs the endpoint's scope *and* a role that
 * allows it: a viewer's token with `tickets:write` still can't change tickets. See docs/reference/api.md.
 */
export const API_SCOPES = [
  'tickets:read',
  'tickets:write',
  'notes:read',
  'notes:write',
  'conversations:read',
  'conversations:write',
  'projects:read',
  'projects:write',
  'tasks:read',
  'tasks:write',
  'people:read',
] as const
export type ApiScope = (typeof API_SCOPES)[number]

/** Events sent to webhooks and listed by `GET /api/v1/events`. See docs/reference/webhooks.md. */
export const WEBHOOK_EVENTS = [
  'ticket.created',
  'ticket.updated',
  'ticket.deleted',
  'ticket.comment.created',
  'ticket.comment.deleted',
  'conversation.created',
  'conversation.updated',
  'conversation.message.created',
  'project.updated',
  'project.deleted',
  'task.created',
  'task.updated',
  'task.deleted',
  'task.comment.created',
  'task.comment.deleted',
] as const
export type WebhookEventType = (typeof WEBHOOK_EVENTS)[number]
