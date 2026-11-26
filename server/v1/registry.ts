import type { EventHandler, H3Event } from 'h3'
import { z } from 'zod'

import ticketsList, { query as ticketsQuery } from '../api/tickets/index.get'
import ticketsCreate, { fields as ticketFields } from '../api/tickets/index.post'
import ticketGet from '../api/tickets/[id]/index.get'
import ticketPatch, { body as ticketPatchBody } from '../api/tickets/[id]/index.patch'
import ticketDelete from '../api/tickets/[id]/index.delete'
import ticketCommentCreate, { fields as ticketCommentFields } from '../api/tickets/[id]/comments/index.post'
import conversationsList, { query as conversationsQuery } from '../api/conversations/index.get'
import conversationGet from '../api/conversations/[id]/index.get'
import conversationPatch, { body as conversationPatchBody } from '../api/conversations/[id]/index.patch'
import conversationMessageCreate, { fields as conversationMessageFields } from '../api/conversations/[id]/messages.post'
import projectsList from '../api/projects/index.get'
import projectGet from '../api/projects/[key]/index.get'
import taskCreate, { newTaskSchema } from '../api/projects/[key]/tasks/index.post'
import taskGet from '../api/tasks/[id]/index.get'
import taskPatch, { body as taskPatchBody } from '../api/tasks/[id]/index.patch'
import taskDelete from '../api/tasks/[id]/index.delete'
import taskCommentCreate, { fields as taskCommentFields } from '../api/tasks/[id]/comments/index.post'
import tasksSearch, { query as tasksSearchQuery } from '../api/tasks/search.get'
import tasksMine from '../api/tasks/mine.get'
import members from '../api/members/index.get'

/**
 * The public API, `/api/v1` (rfcs/0001-apps-platform.md, phase 1). Each endpoint is an existing handler (the same code
 * Ticketer's own pages call) plus a scope; the router (api/v1/[...path].ts) checks the token and scope, runs it, and
 * shapes the answer. This list is also the source of `/api/v1/openapi.json` and the reference docs.
 *
 * Adding an endpoint is a promise kept for years: add only what someone needs, and only additively.
 */
export interface Endpoint {
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  /** OpenAPI style: `/tickets/{id}`. */
  path: string
  scope: ApiScope | null
  tag: 'Account' | 'Tickets' | 'Support chats' | 'Projects' | 'Tasks' | 'People' | 'Events'
  summary: string
  description?: string
  params?: Record<string, 'integer' | 'string'>
  query?: z.ZodType
  body?: z.ZodType
  handler: EventHandler
  /** `list`: wraps `{ items, total, page, pageSize }` as `{ data, total, page, pageSize, nextPage }`. */
  shape?: 'list'
  /** Last changes to the answer, e.g. hiding internal notes from tokens without `notes:read`. */
  transform?: (result: any, event: H3Event) => unknown
  /** The MCP tool for this endpoint (server/routes/mcp.ts). `readOnly` and `destructive` become tool annotations. */
  tool: { name: string; title: string; readOnly?: boolean; destructive?: boolean }
}

const notes = (event: H3Event) => hasApiScope(event, 'notes:read')

const asJson = <T extends z.ZodObject>(schema: T, overrides: Partial<Record<keyof T['shape'], z.ZodType>>) =>
  schema.extend(overrides as Record<string, z.ZodType>)

export const endpoints: Endpoint[] = [
  {
    method: 'GET',
    path: '/me',
    tool: { name: 'whoami', title: 'Who am I', readOnly: true },
    scope: null,
    tag: 'Account',
    summary: 'Who the token acts as, and its scopes',
    handler: defineEventHandler((event) => ({ user: event.context.apiUser, scopes: [...(event.context.apiScopes as Set<string>)] })),
  },

  // Tickets ------------------------------------------------------------------------------------------------------------
  {
    method: 'GET',
    path: '/tickets',
    tool: { name: 'list_tickets', title: 'List tickets', readOnly: true },
    scope: 'tickets:read',
    tag: 'Tickets',
    summary: 'List tickets',
    description: 'The team sees every ticket; people outside it see their own (`scope=mine`, the default) or public ones (`scope=public`). Newest first.',
    query: ticketsQuery,
    handler: ticketsList,
    shape: 'list',
  },
  {
    method: 'POST',
    path: '/tickets',
    tool: { name: 'create_ticket', title: 'Open a ticket' },
    scope: 'tickets:write',
    tag: 'Tickets',
    summary: 'Open a ticket',
    description: 'JSON, or `multipart/form-data` with `files` to attach up to 10 files of 32 MB. Only the team may set `visibility: "public"`.',
    body: ticketFields,
    handler: ticketsCreate,
  },
  {
    method: 'GET',
    path: '/tickets/{id}',
    tool: { name: 'get_ticket', title: 'Get a ticket', readOnly: true },
    scope: 'tickets:read',
    tag: 'Tickets',
    summary: 'Get a ticket with its replies, files and linked tasks',
    description: 'Internal notes are included only for the team, and only with the `notes:read` scope.',
    params: { id: 'integer' },
    handler: ticketGet,
    transform: (ticket, event) => (notes(event) ? ticket : { ...ticket, comments: ticket.comments.filter((c: { internal: boolean }) => !c.internal) }),
  },
  {
    method: 'PATCH',
    path: '/tickets/{id}',
    tool: { name: 'update_ticket', title: 'Update a ticket' },
    scope: 'tickets:write',
    tag: 'Tickets',
    summary: 'Change a ticket’s status, assignee, title or visibility',
    description: 'Admins and members only.',
    params: { id: 'integer' },
    body: ticketPatchBody,
    handler: ticketPatch,
  },
  {
    method: 'DELETE',
    path: '/tickets/{id}',
    tool: { name: 'delete_ticket', title: 'Delete a ticket', destructive: true },
    scope: 'tickets:write',
    tag: 'Tickets',
    summary: 'Delete a ticket, its replies and files',
    description: 'Admins only.',
    params: { id: 'integer' },
    handler: ticketDelete,
  },
  {
    method: 'POST',
    path: '/tickets/{id}/comments',
    tool: { name: 'reply_to_ticket', title: 'Reply to a ticket or add an internal note' },
    scope: 'tickets:write',
    tag: 'Tickets',
    summary: 'Reply to a ticket, or add an internal note',
    description: '`internal: true` needs the `notes:write` scope and a team role. `mentions` takes user IDs. JSON, or multipart with `files`.',
    params: { id: 'integer' },
    body: asJson(ticketCommentFields, { internal: z.boolean().default(false) }),
    handler: ticketCommentCreate,
  },

  // Support chats ------------------------------------------------------------------------------------------------------
  {
    method: 'GET',
    path: '/conversations',
    tool: { name: 'list_conversations', title: 'List support chats', readOnly: true },
    scope: 'conversations:read',
    tag: 'Support chats',
    summary: 'List support chats',
    description: 'The team sees the inbox (open chats by default); people outside it see their own.',
    query: conversationsQuery,
    handler: conversationsList,
    shape: 'list',
    transform: (page, event) => (notes(event) ? page : { ...page, data: page.data.map(withoutNotePreview) }),
  },
  {
    method: 'GET',
    path: '/conversations/{id}',
    tool: { name: 'get_conversation', title: 'Get a support chat', readOnly: true },
    scope: 'conversations:read',
    tag: 'Support chats',
    summary: 'Get a support chat with its messages',
    description: 'Internal notes are included only for the team, and only with the `notes:read` scope.',
    params: { id: 'integer' },
    handler: conversationGet,
    transform: (chat, event) => (notes(event) ? chat : withoutNotePreview({ ...chat, messages: chat.messages.filter((m: { internal: boolean }) => !m.internal) })),
  },
  {
    method: 'PATCH',
    path: '/conversations/{id}',
    tool: { name: 'update_conversation', title: 'Assign, close or reopen a support chat' },
    scope: 'conversations:write',
    tag: 'Support chats',
    summary: 'Assign, close or reopen a support chat',
    params: { id: 'integer' },
    body: conversationPatchBody,
    handler: conversationPatch,
  },
  {
    method: 'POST',
    path: '/conversations/{id}/messages',
    tool: { name: 'send_conversation_message', title: 'Send a message in a support chat' },
    scope: 'conversations:write',
    tag: 'Support chats',
    summary: 'Send a message in a support chat',
    description: '`internal: true` (a note only the team sees) needs the `notes:write` scope. JSON, or multipart with `files`.',
    params: { id: 'integer' },
    body: asJson(conversationMessageFields, { internal: z.boolean().default(false) }),
    handler: conversationMessageCreate,
  },

  // Projects and tasks -------------------------------------------------------------------------------------------------
  {
    method: 'GET',
    path: '/projects',
    tool: { name: 'list_projects', title: 'List projects', readOnly: true },
    scope: 'projects:read',
    tag: 'Projects',
    summary: 'List projects',
    handler: projectsList,
  },
  {
    method: 'GET',
    path: '/projects/{key}',
    tool: { name: 'get_project', title: 'Get a project board', readOnly: true },
    scope: 'projects:read',
    tag: 'Projects',
    summary: 'Get a project’s board: its statuses, tasks, labels and members',
    params: { key: 'string' },
    handler: projectGet,
  },
  {
    method: 'POST',
    path: '/projects/{key}/tasks',
    tool: { name: 'create_task', title: 'Create a task' },
    scope: 'tasks:write',
    tag: 'Tasks',
    summary: 'Create a task',
    params: { key: 'string' },
    body: newTaskSchema,
    handler: taskCreate,
  },
  {
    method: 'GET',
    path: '/tasks/search',
    tool: { name: 'search_tasks', title: 'Search tasks', readOnly: true },
    scope: 'tasks:read',
    tag: 'Tasks',
    summary: 'Search tasks by reference or title',
    query: tasksSearchQuery,
    handler: tasksSearch,
  },
  {
    method: 'GET',
    path: '/tasks/mine',
    tool: { name: 'my_tasks', title: 'My tasks', readOnly: true },
    scope: 'tasks:read',
    tag: 'Tasks',
    summary: 'Tasks assigned to the token’s owner',
    handler: tasksMine,
  },
  {
    method: 'GET',
    path: '/tasks/{id}',
    tool: { name: 'get_task', title: 'Get a task', readOnly: true },
    scope: 'tasks:read',
    tag: 'Tasks',
    summary: 'Get a task with its comments, subtasks and activity',
    params: { id: 'integer' },
    handler: taskGet,
  },
  {
    method: 'PATCH',
    path: '/tasks/{id}',
    tool: { name: 'update_task', title: 'Update a task' },
    scope: 'tasks:write',
    tag: 'Tasks',
    summary: 'Change a task: title, description, status, assignee, priority, dates, labels…',
    params: { id: 'integer' },
    body: taskPatchBody,
    handler: taskPatch,
  },
  {
    method: 'DELETE',
    path: '/tasks/{id}',
    tool: { name: 'delete_task', title: 'Delete a task', destructive: true },
    scope: 'tasks:write',
    tag: 'Tasks',
    summary: 'Delete a task and its subtasks',
    params: { id: 'integer' },
    handler: taskDelete,
  },
  {
    method: 'POST',
    path: '/tasks/{id}/comments',
    tool: { name: 'comment_on_task', title: 'Comment on a task' },
    scope: 'tasks:write',
    tag: 'Tasks',
    summary: 'Comment on a task',
    description: 'JSON, or multipart with `files`.',
    params: { id: 'integer' },
    body: taskCommentFields,
    handler: taskCommentCreate,
  },

  // People and events --------------------------------------------------------------------------------------------------
  {
    method: 'GET',
    path: '/people',
    tool: { name: 'list_people', title: 'List the team', readOnly: true },
    scope: 'people:read',
    tag: 'People',
    summary: 'People on the team (admins, members, viewers), for assigning and mentioning',
    handler: members,
  },
  {
    method: 'GET',
    path: '/events',
    tool: { name: 'list_events', title: 'List recent changes', readOnly: true },
    scope: null,
    tag: 'Events',
    summary: 'What happened, oldest first: the same events webhooks receive',
    description:
      'Team only. Pass the last `id` you saw as `after` to get what came next; events are kept 30 days. Each event type needs the read scope of its area (`tickets:read` for `ticket.*`…); internal notes need `notes:read`.',
    query: z.object({
      after: z.string().max(40).optional().describe('An event id: return events after it'),
      types: z.string().max(500).optional().describe('Comma-separated event types, e.g. `ticket.created,ticket.updated`'),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    handler: defineEventHandler((event) => listEvents(event)),
  },
]
