// Types shared by the Vue app and the Nitro server (auto-imported from `shared/types`).
import type { FIELD_TYPES, RELATION_KINDS, SIGNUP_MODES, TASK_PRIORITIES, TASK_REPEATS, TICKET_STATUSES, TICKET_URGENCIES } from '../utils/constants'

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export type TicketUrgency = (typeof TICKET_URGENCIES)[number]

export interface PublicUser {
  id: string
  name: string
  email: string | null
  role: UserRole
  isAdmin: boolean
  isGuest: boolean
}

export type UserRole = 'admin' | 'member' | 'viewer'
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
  info: string
  urgency: TicketUrgency
  status: TicketStatus
  creatorId: string | null
  creatorName?: string | null
  /** Support person handling the ticket. */
  assigneeId: string | null
  assigneeName?: string | null
  createdAt: string | number | Date
  updatedAt: string | number | Date | null
  resolvedAt: string | number | Date | null
}

export interface CommentDTO {
  id: number
  ticketId: number
  parentId: number | null
  authorId: string | null
  authorName: string
  body: string
  createdAt: string | number | Date
  attachments: AttachmentDTO[]
}

export interface TicketDetailDTO extends TicketDTO {
  attachments: AttachmentDTO[]
  comments: CommentDTO[]
  /** Tasks created from this ticket (visible to members only). */
  tasks: { id: number; ref: string; title: string; projectKey: string; number: number; status: string; isDone: boolean }[]
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
  | { type: 'hello'; body: { clientId: string; transport: RealtimeTransport } }
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
  | { type: 'project.updated'; body: ProjectDTO }
  | { type: 'project.deleted'; body: { id: number } }
  | { type: 'labels.updated'; body: LabelDTO[] }
