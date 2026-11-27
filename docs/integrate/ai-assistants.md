# Use an AI coding assistant

::: tip
To let an assistant work *in* Ticketer (read tickets, reply, update tasks), connect it through MCP instead. See
[Connect an AI assistant](/integrate/mcp).
:::

This page shows you how to let an AI coding assistant, such as Claude Code, Codex, Cursor, GitHub Copilot or Gemini
CLI, add Ticketer to your product for you. You install the Ticketer **skill**, then ask the assistant in plain words.

The skill is a folder of instructions, reference pages and check scripts, written in the open
[Agent Skills](https://agentskills.io) format. It teaches the assistant the flows on these pages: login links, signed
launch links, prefill links, ticket lookup and deleting people. It also tells the assistant what to ask you, which
rules to follow, and how to test the result.

## Before you begin

- An app in **Settings** > **Integrations**, with its App ID, API key and signing secret. See
  [Connect an app](/admin/integrations). The assistant asks for these; keep the key and secret in your server's
  environment, never in the chat history of a shared tool.
- Your Ticketer address, for example `https://tickets.example.com`.

## Install the skill

The skill lives in the Ticketer repository, in
[`skills/ticketer`](https://github.com/PrimalDjinn/Ticketer/tree/main/skills/ticketer).

With [the `skills` command](https://github.com/vercel-labs/skills), which detects the assistants you use and installs
the skill for each one, run this in your product's repository:

```bash
npx skills add PrimalDjinn/Ticketer --skill ticketer
```

Or copy the `skills/ticketer` folder into the folder your assistant reads skills from:

| Assistant | Folder in your repository | Folder for all your projects |
| --- | --- | --- |
| Claude Code | `.claude/skills/ticketer` | `~/.claude/skills/ticketer` |
| OpenAI Codex | `.agents/skills/ticketer` | `~/.agents/skills/ticketer` |
| GitHub Copilot | `.github/skills/ticketer` or `.agents/skills/ticketer` | `~/.copilot/skills/ticketer` |
| Gemini CLI | `.gemini/skills/ticketer` or `.agents/skills/ticketer` | `~/.gemini/skills/ticketer` |
| Cursor | `.cursor/skills/ticketer` | |

`.agents/skills/` works with most of them. Commit the folder if everyone on your team should get it.

## Ask for what you want

Describe the result, not the API. For example:

- "Add a Report a problem button to our app that opens a ticket in Ticketer with the current page and plan."
- "Add a Contact support link that opens a Ticketer chat, signed in as the current user."
- "Show the user's open Ticketer issues on their account page."
- "When someone deletes their account, delete their Ticketer data too, but keep their tickets."

The assistant asks for your Ticketer address and which credentials you have, picks a flow, writes server routes and
buttons, and runs the skill's checks:

- `scripts/check-key.sh` checks the API key without changing anything.
- `scripts/check-signature.mjs` checks signing code against the worked example in
  [Create signed launch links](/integrate/signed-links#check-your-implementation).

Review the change as you would any other: the API key and signing secret must stay on your server.

## What the skill doesn't cover

Ticketer doesn't have a public API for staff work yet, such as listing every ticket, replying as an agent, managing
projects, or receiving webhooks. The skill tells the assistant so, instead of letting it call the internal routes that
Ticketer's own pages use.

## Give an assistant the whole documentation

The documentation is also published as plain text for AI tools:

- [`llms.txt`](/llms.txt): an index of every page.
- [`llms-full.txt`](/llms-full.txt): every page in one file.

Paste either link into an assistant that can read the web, or download the file and attach it.

## What's next

- [Choose an integration flow](/integrate/)
- [Security model](/integrate/security)
- [Integration API reference](/reference/integration-api)
