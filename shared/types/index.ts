// Types shared by the Vue app and the Nitro server (auto-imported from `shared/types`).
import type { TICKET_STATUSES, TICKET_URGENCIES } from '../utils/constants'

export type TicketStatus = (typeof TICKET_STATUSES)[number]

export type TicketUrgency = (typeof TICKET_URGENCIES)[number]

export interface PublicUser {
  id: string
  name: string
  email: string | null
  isAdmin: boolean
  isGuest: boolean
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

export type RealtimeEventType = RealtimeEvent['type']
export type RealtimeTransport = 'websocket' | 'sse' | 'poll'

