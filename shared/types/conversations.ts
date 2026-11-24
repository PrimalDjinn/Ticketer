// Support conversations: people outside the team talking to the whole support team (auto-imported from `shared/types`).
import type { CONVERSATION_STATUSES } from '../utils/constants'
import type { AttachmentDTO } from './index'

export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number]

export interface ConversationMessageDTO {
  id: number
  conversationId: number
  authorId: string | null
  authorName: string
  /** Sent by someone on the team (vs. the customer). */
  fromTeam: boolean
  /** Note between teammates; never sent to the customer. */
  internal: boolean
  body: string
  createdAt: string | number | Date
  attachments: AttachmentDTO[]
}

export interface ConversationDTO {
  id: number
  status: ConversationStatus
  subject: string | null
  customer: { id: string; name: string; email: string | null; isGuest: boolean }
  assigneeId: string | null
  assigneeName: string | null
  ticketId: number | null
  createdAt: string | number | Date
  lastMessageAt: string | number | Date | null
  closedAt: string | number | Date | null
  /** Latest message visible to the current viewer, for list previews. */
  preview: { body: string; fromTeam: boolean; internal: boolean; authorName: string; createdAt: string | number | Date } | null
  /** Messages from the other side the current viewer has not read yet. */
  unread: number
}

export interface ConversationDetailDTO extends ConversationDTO {
  messages: ConversationMessageDTO[]
  /** Last time the customer read the thread (shown to the team as "Seen"). */
  customerReadAt: string | number | Date | null
  /** Latest time anyone on the team read the thread (shown to the customer as "Seen"). */
  teamReadAt: string | number | Date | null
}

/** Inbox counters for the team (sidebar badge, home dashboard, chat button). */
export interface ConversationStats {
  /** Open conversations. */
  open: number
  /** Open conversations nobody is assigned to. */
  unassigned: number
  /** Open conversations assigned to the current person. */
  mine: number
  /** Open conversations with customer messages the current person has not read. */
  unread: number
}

export interface ConversationPage {
  items: ConversationDTO[]
  total: number
  page: number
  pageSize: number
}
