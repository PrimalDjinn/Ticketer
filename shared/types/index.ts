// Types shared by the Vue app and the Nitro server (auto-imported from `shared/types`).
import type { FIELD_TYPES, RELATION_KINDS, SIGNUP_MODES, TASK_PRIORITIES, TASK_REPEATS, TICKET_STATUSES, TICKET_URGENCIES, TICKET_VISIBILITIES, USER_ROLES } from '../utils/constants'
import type { ConversationDTO, ConversationMessageDTO } from './conversations'

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export type TicketUrgency = (typeof TICKET_URGENCIES)[number]

export type TicketVisibility = (typeof TICKET_VISIBILITIES)[number]

export interface PublicUser {
  id: string
  name: string
  email: string | null
  role: UserRole
  isAdmin: boolean
  isGuest: boolean
  /** admin, member or viewer (not a guest). */
  isInternal: boolean
}

export type UserRole = (typeof USER_ROLES)[number]
export type SignupMode = (typeof SIGNUP_MODES)[number]

export interface InviteDTO {
  id: number
  email: string
  role: UserRole
  invitedBy: string | null
  createdAt: string | number | Date
  expiresAt: string | number | Date
  expired: boolean
}

/** Returned when an admin creates or renews an invitation; the link is only ever shown at this moment. */
export interface InviteCreated {
  invite: InviteDTO
  link: string
  emailed: boolean
}

/** What the sign-up page needs to know before showing the form. */
export interface SignupInfo {
  /** True until the first registered account exists; that account becomes the admin. */
  firstAccount: boolean
  mode: SignupMode
  invite: { email: string; role: UserRole; invitedBy: string | null } | null
  /** Set when an invitation token was given but cannot be used. */
  inviteError: string | null
}

export interface AttachmentDTO {
  id: number
  name: string
  contentType: string
  size: number
  url: string
  createdAt: string | number | Date
}

export interface TicketDTO {
  id: number
  reference: string
  /** The ticket's title, or the first line of its description for tickets created before titles existed. */
  title: string
  info: string
  urgency: TicketUrgency
  status: TicketStatus
  creatorId: string | null
  creatorName?: string | null
  /** Support person handling the ticket. */
  assigneeId: string | null
  assigneeName?: string | null
  visibility: TicketVisibility
  publishedAt: string | number | Date | null
  createdAt: string | number | Date
  updatedAt: string | number | Date | null
  resolvedAt: string | number | Date | null
  /** Tasks created from this ticket. Only the ticket list for the team fills this in. */
  tasks?: { ref: string; projectKey: string; number: number }[]
}

export interface CommentDTO {
  id: number
  ticketId: number
  parentId: number | null
  authorId: string | null
  authorName: string
  /** The author is on the team (shown with a "Team" badge to people outside it). */
  authorIsInternal: boolean
  /** Internal note: only internal people ever receive these. */
  internal: boolean
  body: string
  createdAt: string | number | Date
  attachments: AttachmentDTO[]
  /** Mirrored from elsewhere (a GitHub issue comment): `authorName` is the GitHub login. */
  external?: { source: 'github'; url: string | null } | null
}

export interface TicketDetailDTO extends TicketDTO {
  attachments: AttachmentDTO[]
  comments: CommentDTO[]
  /** Whether the current user follows this ticket, and how many people do. */
  watching: boolean
  watcherCount: number
  /** Support conversation this ticket was opened from (internal people only). */
  conversationId: number | null
  /** Tasks created from this ticket (visible to members only). */
  tasks: { id: number; ref: string; title: string; projectKey: string; number: number; status: string; isDone: boolean }[]
}

/**
 * A public ticket as anyone (no account needed) sees it on the public issues page. Carries no emails, user ids,
 * internal notes, linked tasks or conversation ids.
 */
export interface PublicTicketDTO {
  id: number
  reference: string
  title: string
  status: TicketStatus
  urgency: TicketUrgency
  /** First lines of the description, for lists. */
  excerpt: string
  reporterName: string | null
  /** Display name of the person handling it. */
  assigneeName: string | null
  createdAt: string | number | Date
  publishedAt: string | number | Date | null
  updatedAt: string | number | Date | null
  resolvedAt: string | number | Date | null
  /** Latest public activity (reply, status change or publishing). */
  lastActivityAt: string | number | Date
  /** Public replies (internal notes never count). */
  replyCount: number
}

export interface PublicCommentDTO {
  id: number
  parentId: number | null
  authorName: string
  /** Written by someone on the team ("Team" badge). */
  fromTeam: boolean
  body: string
  createdAt: string | number | Date
  attachments: AttachmentDTO[]
}

export interface PublicTicketDetailDTO extends PublicTicketDTO {
  info: string
  attachments: AttachmentDTO[]
  comments: PublicCommentDTO[]
  watcherCount: number
  /** What the signed-in person may do here; null for anonymous visitors. */
  viewer: { registered: boolean; internal: boolean; isReporter: boolean; watching: boolean; canReply: boolean; canFollow: boolean } | null
}

export interface PublicTicketPage {
  items: PublicTicketDTO[]
  total: number
  page: number
  pageSize: number
}

export interface MessageDTO {
  id: number
  chatId: string
  fromId: string
  toId: string
  body: string
  readAt: string | number | Date | null
  createdAt: string | number | Date
  attachments: AttachmentDTO[]
}

export interface ChatDTO {
  id: string
  with: PublicUser
  messages: MessageDTO[]
  lastMessageAt: string | number | Date | null
}

export interface NotificationDTO {
  id: number
  type: string
  message: string
  link: string | null
  readAt: string | number | Date | null
  createdAt: string | number | Date
}

export interface TicketStats {
  Open: number
  Pending: number
  Resolved: number
  Closed: number
}

/** Every realtime event the server can publish. */
export type RealtimeEvent =
  | { type: 'ticket.created'; body: TicketDTO }
  | { type: 'ticket.updated'; body: TicketDTO }
  | { type: 'ticket.deleted'; body: { id: number } }
  | { type: 'comment.created'; body: CommentDTO }
  | { type: 'comment.deleted'; body: { id: number; ticketId: number } }
  | { type: 'message.created'; body: MessageDTO }
  | { type: 'messages.read'; body: { chatId: string; readerId: string } }
  | { type: 'notification'; body: NotificationDTO }
  | { type: 'conversation.updated'; body: ConversationDTO }
  | { type: 'conversation.message'; body: ConversationMessageDTO }
  | { type: 'conversation.read'; body: { conversationId: number; userId: string; readAt: string | number | Date } }
  | { type: 'hello'; body: { clientId: string; transport: RealtimeTransport } }
  /** Public issues, sent to everyone with the site open: newly published, changed, or no longer public. */
  | { type: 'issue.published'; body: PublicTicketDTO & { actorId: string | null } }
  | { type: 'issue.updated'; body: PublicTicketDTO }
  | { type: 'issue.removed'; body: { reference: string } }
  | { type: 'ping'; body: number }
  | TaskRealtime

export type RealtimeEventType = RealtimeEvent['type']
export type RealtimeTransport = 'websocket' | 'sse' | 'poll'


// ---------------------------------------------------------------------------------------------------------------------
// Projects and tasks
// ---------------------------------------------------------------------------------------------------------------------

export type TaskPriority = (typeof TASK_PRIORITIES)[number]
export type TaskRepeat = (typeof TASK_REPEATS)[number]
export type FieldType = (typeof FIELD_TYPES)[number]
export type RelationKind = (typeof RELATION_KINDS)[number]
export type FieldValue = string | number | boolean | string[]

export interface FieldDTO {
  id: number
  projectId: number
  name: string
  type: FieldType
  /** Choices for select / multiselect. */
  options: string[]
  required: boolean
  position: number
}

export interface TaskRelationDTO {
  id: number
  /** From the point of view of the task being viewed. */
  kind: RelationKind
  task: { id: number; ref: string; title: string; projectKey: string; number: number; status: string; statusColor: string; isDone: boolean }
}

export interface StatusDTO {
  id: number
  projectId: number
  name: string
  color: string
  position: number
  isDone: boolean
}

export interface LabelDTO {
  id: number
  name: string
  color: string
}

export interface ProjectDTO {
  id: number
  key: string
  name: string
  description: string
  color: string
  archivedAt: string | number | Date | null
  createdAt: string | number | Date
  statuses: StatusDTO[]
  fields: FieldDTO[]
  /** Open (not done) / total task counts, for the sidebar and project list. */
  openCount: number
  taskCount: number
  /** "owner/repo" when the project syncs with a GitHub repository. */
  githubRepo: string | null
}

/** A task as shown on boards and lists. */
export interface TaskDTO {
  id: number
  projectId: number
  /** e.g. "SUP-12" */
  ref: string
  number: number
  title: string
  statusId: number
  priority: TaskPriority
  assigneeId: string | null
  parentId: number | null
  ticketId: number | null
  startDate: string | null
  dueDate: string | null
  position: number
  repeat: TaskRepeat | null
  /** Days between occurrences when repeat is `periodically`. */
  repeatInterval: number | null
  /** Custom field values keyed by field id. */
  fieldValues: Record<number, FieldValue>
  /** Open tasks that block this one (drives the "blocked" marker on cards). */
  blockedByCount: number
  labelIds: number[]
  subtaskCount: number
  subtaskDoneCount: number
  commentCount: number
  attachmentCount: number
  createdAt: string | number | Date
  updatedAt: string | number | Date | null
  completedAt: string | number | Date | null
  /** The linked GitHub issue, when the project syncs with a repository. */
  github: { number: number; url: string; state: 'open' | 'closed' } | null
}

export interface TaskActivityDTO {
  id: number
  actorId: string | null
  actorName: string
  field: string
  fromValue: string | null
  toValue: string | null
  createdAt: string | number | Date
}

export interface TaskDetailDTO extends TaskDTO {
  description: string
  creatorId: string | null
  creatorName: string | null
  project: { id: number; key: string; name: string; color: string }
  attachments: AttachmentDTO[]
  /** Uses the same shape as ticket comments; `ticketId` holds the task id. */
  comments: CommentDTO[]
  subtasks: TaskDTO[]
  parent: { id: number; ref: string; title: string } | null
  relations: TaskRelationDTO[]
  activity: TaskActivityDTO[]
  /** People notified about comments, status changes and reassignment. */
  followers: TaskFollowerDTO[]
}

export interface TaskFollowerDTO {
  id: string
  name: string
}

/** Board payload: everything needed to render a project without further requests. */
export interface ProjectBoardDTO {
  project: ProjectDTO
  tasks: TaskDTO[]
  labels: LabelDTO[]
  members: PublicUser[]
}

export type TaskRealtime =
  | { type: 'task.created'; body: TaskDTO }
  | { type: 'task.updated'; body: TaskDTO }
  | { type: 'task.deleted'; body: { id: number; projectId: number } }
  | { type: 'task.comment.created'; body: CommentDTO & { taskId: number } }
  | { type: 'task.comment.deleted'; body: { id: number; taskId: number } }
  | { type: 'task.followers'; body: { taskId: number; followers: TaskFollowerDTO[] } }
  | { type: 'project.updated'; body: ProjectDTO }
  | { type: 'project.deleted'; body: { id: number } }
  | { type: 'labels.updated'; body: LabelDTO[] }

/** GET /api/public/overview: shown on the public home, the issues page and the chat widget. */
export interface PublicOverview {
  /** Median first reply in support chats over the last 30 days; `text` is null until there's enough data. */
  reply: { minutes: number | null; sample: number; text: string | null }
  status: {
    open: number
    urgent: boolean
    latest: { reference: string; title: string; status: TicketStatus; urgency: TicketUrgency; updatedAt: string | number | Date }[]
  }
}

/** GET /api/public/site: how this site presents itself, and what public forms need. Loaded once per visit. */
export interface SiteInfo {
  /** The organisation or product name shown everywhere ("Ticketer" until set). */
  name: string
  /** Public URL of the logo, or null for the name alone. */
  logoUrl: string | null
  accent: AccentColor
  /** The organisation's own website, linked from the public pages. */
  website: string | null
  /** Bot protection widget for sign-up and visitor forms; null when off. */
  captcha: { provider: CaptchaProvider; siteKey: string } | null
}
