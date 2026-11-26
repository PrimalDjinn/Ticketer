# Choose an integration flow

This section is for developers of another product who want a "Report a problem" or "Contact support" button that
sends their users to Ticketer. This page helps you pick the right flow.

Every flow needs an app that an admin created in **Settings** > **Integrations**. See
[Connect an app](/admin/integrations). Depending on the flow, you use the app's ID, API key or signing secret.

## Compare the flows

| Flow | Signs the person in | Needs | Use it when |
| --- | --- | --- | --- |
| [Login link](/integrate/login-link) (`POST /api/integrations/v1/sessions`) | Yes | API key, a server-to-server call | Your backend can call Ticketer, and you want the JSON result: the link, the user ID, the created ticket. |
| [Redirect](/integrate/redirect) (`GET /api/integrations/v1/sessions`) | Yes | API key, a server-to-server call | Your backend can only proxy a redirect: it calls Ticketer and passes the `302` on to the browser. |
| [Signed launch link](/integrate/signed-links) (`GET /launch?…&sig=…`) | Yes | Signing secret; no call to Ticketer | Your backend can compute an HMAC, and you don't want a call to Ticketer before each redirect. |
| [Prefill link](/integrate/prefill-links) (`GET /launch?app=…&title=…`) | No | Only the app ID | You only want to open a prefilled report form. The person signs in, or continues as a guest. |
| [Ticket lookup](/integrate/tickets) (`GET /api/integrations/v1/tickets`) | No | API key | You want to show "your open issues" inside your product. |
| [Delete a person](/integrate/delete-people) (`DELETE /api/integrations/v1/users`) | No | API key, and **Can delete people** on the app | Someone asks your product to erase their data, and Ticketer should erase it too. |

All flows that sign someone in work only for people outside the team. If the email belongs to an admin, member or
viewer, Ticketer refuses: those people must sign in to Ticketer directly. See [Security model](/integrate/security).

## Where people land

The flows that sign people in take a `target`:

| Target | Lands on |
| --- | --- |
| `new-ticket` | The report form |
| `chat` | The home page, with the support chat open |
| `tickets` | The person's ticket list |
| `ticket` | One ticket, given by its ID. It must be the person's own ticket or a public one. |

Without a target, people land on the app's **Landing page**. If you also send a ticket, Ticketer creates it and, unless
you ask for another target, opens it.

## Let an AI assistant do it

Coding assistants such as Claude Code, Codex, Cursor and GitHub Copilot can add these flows for you with the Ticketer
skill. See [Use an AI coding assistant](/integrate/ai-assistants).

## What's next

- [Create a login link](/integrate/login-link)
- [Signed launch links](/integrate/signed-links)
- [Integration API reference](/reference/integration-api)
