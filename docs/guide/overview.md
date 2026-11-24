# Overview

Ticketer is a help desk, a public issue tracker and a project tracker in one web app. This page describes what it does
and helps you choose where to host it.

## What Ticketer does

Ticketer has three areas:

- **Help desk.** Anyone can open a ticket, with or without an account, and attach screenshots and documents. The team
  replies, writes internal notes, mentions teammates with `@`, assigns tickets and changes their status. A support chat
  lands in a shared inbox, where any teammate can answer it, take it, or turn it into a ticket.
- **Public issues.** The team can make any ticket public. Public tickets are listed at `/issues` and can be read
  without signing in. Internal notes stay private.
- **Projects and tasks.** Projects have their own workflow columns. Tasks have a priority, assignee, dates, labels,
  subtasks, relations, repeat rules and custom fields, and appear on a board, a list, a calendar and a Gantt chart. A
  ticket can be handed to a project as a linked task.

Pages update live for everyone who has them open.

## Who uses it

Every account has one of four roles. Admins, members and viewers are the team; external accounts are customers,
partners or anyone else outside it. Visitors without an account can still open tickets and start a support chat; they
get a guest session that moves to their account if they register later.

| Role | Summary |
| --- | --- |
| Admin | Everything a member can do, plus people, invitations, settings and integrations. |
| Member | Works on projects, tasks, tickets and support chats. |
| Viewer | On the team, read-only. |
| External | Sees their own tickets and public tickets, and can chat with support. |

For the full matrix, see [Roles and permissions](/reference/roles).

## Choose where to host it

Ticketer runs from one codebase in two places:

| | Cloudflare | Node or Docker |
| --- | --- | --- |
| Runtime | Cloudflare Workers | Node.js (the Docker image uses Node 24) |
| Database | D1 | SQLite file |
| Uploaded files | R2 | `.data/blob` on disk |
| Realtime | One Durable Object holds all connections | In the server process |
| Email | Cloudflare Email Sending | SMTP |
| First admin from the command line | No; use environment variables | Yes, with `pnpm admin` |

Choose **Cloudflare** if you want a managed deployment without a server to maintain. The Deploy to Cloudflare button
creates everything for you.

Choose **Docker** if you want to keep your data on your own machine or network, or if you want to send mail through an
SMTP server you already use. Everything Ticketer writes lives on one volume.

## What's next

- [Deploy to Cloudflare](/guide/deploy-cloudflare)
- [Run with Docker](/guide/docker)
- [Local development](/guide/local-development)
