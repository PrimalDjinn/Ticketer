# Connect an AI assistant

This page shows you how to connect an AI assistant, such as Claude Code, Cursor, VS Code with GitHub Copilot or
OpenAI Codex, to Ticketer through MCP (Model Context Protocol). The assistant can then find and read tickets, support
chats and tasks, reply, add internal notes, and change status and assignees, as you and within the limits you set.

To have an assistant write code that connects your product to Ticketer, use the skill instead; see
[Use an AI coding assistant](/integrate/ai-assistants).

## Before you begin

- You're on the team: an admin, member or viewer.
- A personal access token. Create one under **Account** > **Access tokens**; see
  [Use the API](/integrate/api#create-a-token). Its scopes decide what the assistant can do, so give only what it
  needs. With only read scopes, the assistant can look but not change anything.
- Your Ticketer address, for example `https://tickets.example.com`. The MCP server is at `/mcp` on it.

## Connect

In each example, replace `https://tickets.example.com` with your Ticketer address, and keep the token out of files you
share or commit.

**Claude Code**

```bash
claude mcp add --transport http ticketer https://tickets.example.com/mcp \
  --header "Authorization: Bearer $TICKETER_TOKEN"
```

**Cursor**: in `~/.cursor/mcp.json`, or `.cursor/mcp.json` in a project:

```json
{
  "mcpServers": {
    "ticketer": {
      "url": "https://tickets.example.com/mcp",
      "headers": { "Authorization": "Bearer tkp_…" }
    }
  }
}
```

**VS Code with GitHub Copilot**: in `.vscode/mcp.json`. VS Code asks for the token once and stores it securely:

```json
{
  "inputs": [{ "type": "promptString", "id": "ticketer-token", "description": "Ticketer access token", "password": true }],
  "servers": {
    "ticketer": {
      "type": "http",
      "url": "https://tickets.example.com/mcp",
      "headers": { "Authorization": "Bearer ${input:ticketer-token}" }
    }
  }
}
```

**OpenAI Codex**: in `~/.codex/config.toml`, with the token in the `TICKETER_TOKEN` environment variable:

```toml
[mcp_servers.ticketer]
url = "https://tickets.example.com/mcp"
bearer_token_env_var = "TICKETER_TOKEN"
```

Other assistants that support remote MCP servers over HTTP with a custom `Authorization` header work the same way.
Assistants that only connect through OAuth sign-in, such as the connectors in the Claude and ChatGPT apps, can't
connect yet.

## What the assistant can do

Each tool is an endpoint of the [API](/integrate/api#endpoints), and the assistant sees only the tools the token's
scopes allow.

| Tool | Does | Scope |
| --- | --- | --- |
| `whoami` | Who the token acts as, and its scopes | Any |
| `list_tickets`, `get_ticket` | Find and read tickets with their replies | `tickets:read` |
| `create_ticket`, `update_ticket`, `reply_to_ticket` | Open, change and reply to tickets | `tickets:write` |
| `delete_ticket` | Delete a ticket (admins) | `tickets:write` |
| `list_conversations`, `get_conversation` | Find and read support chats | `conversations:read` |
| `update_conversation`, `send_conversation_message` | Assign, close, reopen and reply to chats | `conversations:write` |
| `list_projects`, `get_project` | Projects and their boards | `projects:read` |
| `search_tasks`, `my_tasks`, `get_task` | Find and read tasks | `tasks:read` |
| `create_task`, `update_task`, `comment_on_task`, `delete_task` | Change tasks | `tasks:write` |
| `list_people` | The team, for assigning and mentioning | `people:read` |
| `list_events` | Recent changes | The area's read scope |

The same rules as the API apply:

- The assistant can never do more than your role allows.
- Internal notes need `notes:read` to read and `notes:write` to write.
- Email addresses need `people:read`.
- Everything it changes shows in history as you.

Replies the assistant sends with `reply_to_ticket` or `send_conversation_message` reach the customer unless they're
internal notes. Ticketer tells the assistant this, and marks `delete_ticket` and `delete_task` as destructive so
assistants ask before using them. Most assistants ask you to approve each tool call; keep that on for changes.

## Things to ask

- "What urgent tickets are open and unassigned?"
- "Summarise ticket 42 and its replies, and draft a reply as an internal note."
- "Create a task in WEB for the bug in ticket 42 and assign it to me."
- "Which of my tasks are due this week?"

## What's next

- [Use the API](/integrate/api)
- [Use an AI coding assistant](/integrate/ai-assistants)
- [Control API access](/admin/api)
