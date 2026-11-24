import { sql } from 'drizzle-orm'
import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core'

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
  /**
   * Internal people: admin (manages people, projects and support), member (works on tasks and support), viewer
   * (read-only). external: someone outside the team; sees their own and public tickets and chats with support.
   */
  role: text('role', { enum: ['admin', 'member', 'viewer', 'external'] })
    .notNull()
    .default('member'),
  isGuest: integer('is_guest', { mode: 'boolean' }).notNull().default(true),
  companyId: integer('company_id').references(() => companies.id, { onDelete: 'set null' }),
  /** Email a copy of notifications. Null: the default for the role (on for people outside the team, off for the team). */
  emailNotifications: integer('email_notifications', { mode: 'boolean' }),
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

/** An admin's invitation to join. The link carries the token; only its hash is stored. */
export const invites = sqliteTable(
  'invites',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    email: text('email').notNull(),
    role: text('role', { enum: ['admin', 'member', 'viewer', 'external'] })
      .notNull()
      .default('member'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedById: text('invited_by_id').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    acceptedAt: integer('accepted_at', { mode: 'timestamp_ms' }),
    acceptedById: text('accepted_by_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('invites_email_idx').on(t.email)],
)

/** Instance-wide settings edited by admins (key → JSON value). */
export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value', { mode: 'json' }).notNull(),
})

export const tickets = sqliteTable(
  'tickets',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    reference: text('reference').notNull().unique(),
    /** Short summary. Older tickets have none; their first line of `info` stands in. */
    title: text('title'),
    info: text('info').notNull(),
    urgency: text('urgency', { enum: ['Default', 'Urgent', 'Emergency'] })
      .notNull()
      .default('Default'),
    status: text('status', { enum: ['Open', 'Pending', 'Resolved', 'Closed'] })
      .notNull()
      .default('Open'),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    /** The support person handling the ticket. */
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    /** private: the reporter and internal people. public: anyone, including visitors without an account. */
    visibility: text('visibility', { enum: ['private', 'public'] })
      .notNull()
      .default('private'),
    publishedAt: integer('published_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('tickets_status_idx').on(t.status),
    index('tickets_creator_idx').on(t.creatorId),
    index('tickets_assignee_idx').on(t.assigneeId),
    index('tickets_visibility_idx').on(t.visibility),
  ],
)

/** People following a ticket's updates: the reporter, people who replied, and anyone who pressed Follow. */
export const ticketWatchers = sqliteTable(
  'ticket_watchers',
  {
    ticketId: integer('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.userId] }), index('ticket_watchers_user_idx').on(t.userId)],
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
    /** Internal notes are only ever shown to internal people. */
    internal: integer('internal', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('comments_ticket_idx').on(t.ticketId)],
)

/**
 * Support conversations: someone outside the team (an external account or a guest) talking to the support team as a
 * whole. Any internal person can reply; one can be assigned.
 */
export const conversations = sqliteTable(
  'conversations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    customerId: text('customer_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    subject: text('subject'),
    status: text('status', { enum: ['open', 'closed'] })
      .notNull()
      .default('open'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    /** Ticket opened from this conversation. */
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    lastMessageAt: integer('last_message_at', { mode: 'timestamp_ms' }),
    closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    index('conversations_customer_idx').on(t.customerId),
    index('conversations_status_idx').on(t.status, t.lastMessageAt),
    index('conversations_assignee_idx').on(t.assigneeId),
  ],
)

export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull().default(''),
    /** Notes between teammates inside a conversation; never shown to the customer. */
    internal: integer('internal', { mode: 'boolean' }).notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index('conversation_messages_conversation_idx').on(t.conversationId)],
)

/** How far each person has read a conversation (customer and every teammate separately). */
export const conversationReads = sqliteTable(
  'conversation_reads',
  {
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    readAt: integer('read_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
)

/**
 * Direct messages between two internal people; the id is both user ids sorted and joined, so it is stable. Support
 * chats with people outside the team live in `conversations`.
 */
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
    taskId: integer('task_id').references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    taskCommentId: integer('task_comment_id').references((): AnySQLiteColumn => taskComments.id, { onDelete: 'cascade' }),
    conversationMessageId: integer('conversation_message_id').references((): AnySQLiteColumn => conversationMessages.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('attachments_pathname_idx').on(t.pathname),
    index('attachments_ticket_idx').on(t.ticketId),
    index('attachments_comment_idx').on(t.commentId),
    index('attachments_message_idx').on(t.messageId),
    index('attachments_task_idx').on(t.taskId),
    index('attachments_task_comment_idx').on(t.taskCommentId),
    index('attachments_conversation_message_idx').on(t.conversationMessageId),
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
    /** When a copy was emailed; used to send at most one email per link every few minutes. */
    emailedAt: integer('emailed_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_unread_idx').on(t.userId, t.readAt)],
)

/** Browsers that receive Web Push notifications (one row per browser profile and person). */
export const pushSubscriptions = sqliteTable(
  'push_subscriptions',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull().unique(),
    /** The browser's P-256 public key and auth secret (base64url), used to encrypt each message. */
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSentAt: integer('last_sent_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('push_subscriptions_user_idx').on(t.userId)],
)

// ---------------------------------------------------------------------------------------------------------------------
// Projects (Kaneo-style task tracking)
// ---------------------------------------------------------------------------------------------------------------------

export const projects = sqliteTable('projects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** Short uppercase prefix for task numbers, e.g. SUP -> SUP-12. */
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  color: text('color').notNull().default('indigo'),
  nextNumber: integer('next_number').notNull().default(1),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
})

/** The project's workflow: one board column per status, ordered by `position`. */
export const projectStatuses = sqliteTable(
  'project_statuses',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('neutral'),
    position: integer('position').notNull().default(0),
    /** Tasks in a done column count as completed. */
    isDone: integer('is_done', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [index('project_statuses_project_idx').on(t.projectId)],
)

export const tasks = sqliteTable(
  'tasks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    number: integer('number').notNull(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    statusId: integer('status_id')
      .notNull()
      .references(() => projectStatuses.id),
    priority: text('priority', { enum: ['none', 'low', 'medium', 'high', 'urgent'] })
      .notNull()
      .default('none'),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    creatorId: text('creator_id').references(() => users.id, { onDelete: 'set null' }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => tasks.id, { onDelete: 'cascade' }),
    ticketId: integer('ticket_id').references(() => tickets.id, { onDelete: 'set null' }),
    startDate: text('start_date'),
    dueDate: text('due_date'),
    /** Order inside a board column; fractional so a drop only rewrites the moved card. */
    position: real('position').notNull().default(0),
    /** Recurrence: when the task reaches a done column, the next occurrence is created in the first open column. */
    repeat: text('repeat', { enum: ['daily', 'weekly', 'monthly', 'yearly', 'periodically'] }),
    /** Days between occurrences when `repeat` is `periodically`. */
    repeatInterval: integer('repeat_interval'),
    /** The task this one was repeated from, so an occurrence is only spawned once. */
    repeatedFromId: integer('repeated_from_id'),
    createdAt: createdAt(),
    updatedAt: integer('updated_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('tasks_project_number_idx').on(t.projectId, t.number),
    index('tasks_status_idx').on(t.statusId),
    index('tasks_assignee_idx').on(t.assigneeId),
    index('tasks_parent_idx').on(t.parentId),
    index('tasks_ticket_idx').on(t.ticketId),
  ],
)

export const labels = sqliteTable('labels', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  color: text('color').notNull().default('neutral'),
})

export const taskLabels = sqliteTable(
  'task_labels',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    labelId: integer('label_id')
      .notNull()
      .references(() => labels.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.labelId] }), index('task_labels_label_idx').on(t.labelId)],
)

export const taskComments = sqliteTable(
  'task_comments',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    parentId: integer('parent_id').references((): AnySQLiteColumn => taskComments.id, { onDelete: 'cascade' }),
    authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
    body: text('body').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [index('task_comments_task_idx').on(t.taskId)],
)

/** Field-level history shown in the task timeline. */
export const taskActivity = sqliteTable(
  'task_activity',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
    field: text('field').notNull(),
    fromValue: text('from_value'),
    toValue: text('to_value'),
    createdAt: createdAt(),
  },
  (t) => [index('task_activity_task_idx').on(t.taskId)],
)

/** Directed link between tasks: `blocks` (task blocks related) or `relates`. */
export const taskRelations = sqliteTable(
  'task_relations',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    relatedTaskId: integer('related_task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    type: text('type', { enum: ['blocks', 'relates'] }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('task_relations_pair_idx').on(t.taskId, t.relatedTaskId),
    index('task_relations_related_idx').on(t.relatedTaskId),
  ],
)

/** Per-project custom fields shown on every task of the project. */
export const projectFields = sqliteTable(
  'project_fields',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    type: text('type', { enum: ['text', 'number', 'date', 'select', 'multiselect', 'checkbox'] }).notNull(),
    /** Choices for select / multiselect. */
    options: text('options', { mode: 'json' }).$type<string[]>().notNull().default([]),
    required: integer('required', { mode: 'boolean' }).notNull().default(false),
    position: integer('position').notNull().default(0),
  },
  (t) => [index('project_fields_project_idx').on(t.projectId)],
)

export const taskFieldValues = sqliteTable(
  'task_field_values',
  {
    taskId: integer('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    fieldId: integer('field_id')
      .notNull()
      .references(() => projectFields.id, { onDelete: 'cascade' }),
    /** JSON-encoded: string | number | boolean | string[] */
    value: text('value', { mode: 'json' }).$type<FieldValue>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.fieldId] }), index('task_field_values_field_idx').on(t.fieldId)],
)

export type FieldValue = string | number | boolean | string[]

export type User = typeof users.$inferSelect
export type Ticket = typeof tickets.$inferSelect
export type Comment = typeof comments.$inferSelect
export type Message = typeof messages.$inferSelect
export type Attachment = typeof attachments.$inferSelect
export type Notification = typeof notifications.$inferSelect
export type Project = typeof projects.$inferSelect
export type ProjectStatus = typeof projectStatuses.$inferSelect
export type Task = typeof tasks.$inferSelect
export type Label = typeof labels.$inferSelect
export type Invite = typeof invites.$inferSelect
export type Conversation = typeof conversations.$inferSelect
export type ConversationMessage = typeof conversationMessages.$inferSelect

// ---------------------------------------------------------------------------------------------------------------------
// Single sign-on and app integrations
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Another product allowed to send its users here ("Report a problem" buttons). The API key is stored as a SHA-256 hash
 * only; the signing secret (HMAC for browser links) has to be recoverable, so it is kept encrypted (see `encryptSecret`).
 */
export const integrationApps = sqliteTable('integration_apps', {
  /** Public id, used in signed links (`app=`). */
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  /** Origins (scheme://host[:port]) a `returnUrl` may point to. Empty: no "Back to" link. */
  allowedOrigins: text('allowed_origins', { mode: 'json' }).$type<string[]>().notNull().default([]),
  /** Where people land when the request names no target. */
  landing: text('landing', { enum: ['new-ticket', 'chat', 'tickets'] })
    .notNull()
    .default('new-ticket'),
  /** May create accounts for people who have none yet (always as external). */
  canProvision: integer('can_provision', { mode: 'boolean' }).notNull().default(true),
  /** May delete the accounts of people it brought here (DELETE /api/integrations/v1/users). Off unless an admin enables it. */
  canDelete: integer('can_delete', { mode: 'boolean' }).notNull().default(false),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  keyHash: text('key_hash').notNull().unique(),
  /** First characters of the key, so admins can tell keys apart. */
  keyPrefix: text('key_prefix').notNull(),
  signingSecret: text('signing_secret').notNull(),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  rotatedAt: integer('rotated_at', { mode: 'timestamp_ms' }),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  /** API calls made with the key. */
  apiCalls: integer('api_calls').notNull().default(0),
  /** People signed in through the app (login links and signed links). */
  signIns: integer('sign_ins').notNull().default(0),
  ticketsCreated: integer('tickets_created').notNull().default(0),
})

/**
 * An outside identity linked to an account: `oidc` (subject = the provider's `sub`) or `app:<integration app id>`
 * (subject = the other product's user id).
 */
export const userIdentities = sqliteTable(
  'user_identities',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    provider: text('provider').notNull(),
    subject: text('subject').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    email: text('email'),
    createdAt: createdAt(),
    lastUsedAt: integer('last_used_at', { mode: 'timestamp_ms' }),
  },
  (t) => [uniqueIndex('user_identities_provider_subject_idx').on(t.provider, t.subject), index('user_identities_user_idx').on(t.userId)],
)

/** Single-use sign-in links handed out to integration apps (valid for minutes). Only the token's hash is stored. */
export const loginLinks = sqliteTable(
  'login_links',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    tokenHash: text('token_hash').notNull().unique(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    appId: text('app_id').references(() => integrationApps.id, { onDelete: 'cascade' }),
    /** Internal path to open after signing in, built by the server. */
    target: text('target').notNull(),
    /** Validated against the app's allowed origins when the link was made. */
    returnUrl: text('return_url'),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
    usedAt: integer('used_at', { mode: 'timestamp_ms' }),
    createdAt: createdAt(),
  },
  (t) => [index('login_links_expires_idx').on(t.expiresAt)],
)

/** Nonces of signed launch links already seen, kept until the link would have expired anyway (replay protection). */
export const integrationNonces = sqliteTable(
  'integration_nonces',
  {
    appId: text('app_id')
      .notNull()
      .references(() => integrationApps.id, { onDelete: 'cascade' }),
    nonce: text('nonce').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.appId, t.nonce] }), index('integration_nonces_expires_idx').on(t.expiresAt)],
)

export type IntegrationApp = typeof integrationApps.$inferSelect
export type UserIdentity = typeof userIdentities.$inferSelect

/**
 * Proof that an account was erased, kept without personal data: the opaque user id, when, how and by whom. Written by
 * `deleteAccount` (server/utils/accounts.ts).
 */
export const accountDeletions = sqliteTable('account_deletions', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  /** The deleted account's id (a random ULID; the row it pointed to is gone). */
  userId: text('user_id').notNull(),
  role: text('role').notNull(),
  /** self: the person deleted their own account; admin: from Members; app: through the integrations API. */
  via: text('via', { enum: ['self', 'admin', 'app'] }).notNull(),
  /** Admin user id or integration app id. No foreign key: the actor may be deleted later. */
  actorId: text('actor_id'),
  tickets: text('tickets', { enum: ['keep', 'delete-private', 'delete'] }).notNull(),
  /** Counts of what was removed, e.g. { tickets: 2, files: 5, conversations: 1 }. */
  summary: text('summary', { mode: 'json' }).$type<Record<string, number>>().notNull(),
  createdAt: createdAt(),
})
