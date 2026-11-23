import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

const createdAt = () =>
  integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .default(sql`(unixepoch() * 1000)`)

export const companies = sqliteTable('companies', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

/**
 * Registered people and anonymous guests share one table so a guest who later signs up keeps their tickets and
 * chats: registering fills in email/password on the same row.
 */
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  name: text('name').unique(),
  passwordHash: text('password_hash'),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
})

export const passwordResets = sqliteTable('password_resets', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  usedAt: integer('used_at', { mode: 'timestamp_ms' }),
  createdAt: createdAt(),
})

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reference: text('reference').notNull().unique(),
    info: text('info').notNull(),
    urgency: text('urgency', { enum: ['Default', 'Urgent', 'Emergency'] })
      .notNull()
      .default('Default'),
    status: text('status', { enum: ['Open', 'Pending', 'Resolved', 'Closed'] })
      .notNull()
      .default('Open'),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('tickets_status_idx').on(t.status), index('tickets_creator_idx').on(t.creatorId)],
)

export const comments = sqliteTable(
  'comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => comments.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('comments_ticket_idx').on(t.ticketId)],
)

/** A conversation between exactly two users; the id is both user ids sorted and joined, so it is stable. */
export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userA: text('user_a')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  userB: text('user_b')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
})

export const messages = sqliteTable(
  'messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    fromId: text('from_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toId: text('to_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull().default(''),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('messages_chat_idx').on(t.chatId), index('messages_to_unread_idx').on(t.toId, t.readAt)],
)

/**
 * Files stored in blob storage (R2 on Cloudflare, `.data/blob` on Node). Exactly one owner column is set.
 */
export const attachments = sqliteTable(
  'attachments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    pathname: text('pathname').notNull(),
    name: text('name').notNull(),
    contentType: text('content_type').notNull().default('application/octet-stream'),
    size: integer('size').notNull().default(0),
    uploaderId: text('uploader_id').references(() => users.id, { onDelete: 'set null' }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'cascade' }),
    commentId: integer('comment_id').references(() => comments.id, { onDelete: 'cascade' }),
    messageId: integer('message_id').references(() => messages.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('attachments_pathname_idx').on(t.pathname),
    index('attachments_ticket_idx').on(t.ticketId),
    index('attachments_comment_idx').on(t.commentId),
    index('attachments_message_idx').on(t.messageId),
  ],
)

export const notifications = sqliteTable(
  'notifications',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    message: text('message').notNull(),
    link: text('link'),
    readAt: integer('read_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.userId, t.readAt)],
)

export type User = typeof users.$inferSelect
export type Ticket = typeof tickets.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Message = typeof messages.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type Notification = typeof notifications.$inferSelect
