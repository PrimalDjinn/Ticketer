// Values shared by the Vue app and the Nitro server (auto-imported from `shared/utils`).

export const TICKET_STATUSES = ['Open', 'Pending', 'Resolved', 'Closed'] as const
export const TICKET_URGENCIES = ['Default', 'Urgent', 'Emergency'] as const

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
  user: (id: string) => `user:${id}`,
}
