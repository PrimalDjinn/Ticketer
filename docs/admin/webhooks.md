# Send events to other tools

This page shows admins how to make Ticketer send events (a ticket opened, a reply, a task moved) to another tool
such as n8n, Zapier, Make, a chat bot or your own code. For the receiving side, see
[Receive webhooks](/integrate/webhooks).

## Before you begin

- You're signed in as an admin.
- The receiving tool gives you an address that accepts `POST` requests, starting with `https://`.

## Add a webhook

1. Go to **Settings** > **Webhooks** and select **Add webhook**.
2. Enter a **Name**, such as `n8n`.
3. Enter the **Address**.
4. Under **Events**, leave **All events, including ones added later** on, or turn it off and choose events.
5. Choose what may leave Ticketer:
   - **Send internal notes**: notes on tickets and chats that only the team sees. Off by default; when off, they're
     never sent.
   - **Send email addresses**: off by default; when off, email addresses are removed from every event.
6. Select **Add webhook**.
7. Copy the **Signing secret** into the receiving tool, then select **I have copied it**. It's shown only once.

Select the paper plane next to the webhook to send a test event and see what the receiver answered.

## Watch deliveries

Open the webhook's actions menu and select **Deliveries** to see the last 50 deliveries from the past 7 days: the
event, the receiver's answer and how long it took. Select **Redeliver** to send a failed one again.

Ticketer retries a failed delivery 1 minute, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours and 24 hours later.
It turns a webhook off when the receiver answers `410 Gone`, or when every delivery fails for 3 days, and tells the
admins. Fix the receiver, then turn the webhook on again with its switch.

## Edit, rotate or delete

From the webhook's actions menu:

- **Edit** changes the name, address, events and what may be sent.
- **Rotate secret** creates a new signing secret. The old one stops working at once, so update the receiver.
- **Delete** removes the webhook and its delivery history.

## Private addresses

Webhooks can't reach private or local addresses, such as `192.168.1.20`, `10.0.0.5` or `localhost`, or plain
`http://` addresses. This stops someone with admin access from making the server call hosts on its own network.
If your receiver runs on the same network, such as n8n next to Ticketer in Docker, set
`NUXT_WEBHOOKS_ALLOW_PRIVATE_NETWORK=true` and restart. **Settings** > **Webhooks** then shows a warning.

## What's next

- [Receive webhooks](/integrate/webhooks)
- [Control API access](/admin/api)
