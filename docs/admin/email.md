# Set up email

Ticketer sends two kinds of email: invitations and password reset links. This page shows you how to set up sending on
Node or Docker (SMTP) and on Cloudflare (Cloudflare Email Sending), and how to test it.

Until email works, Ticketer writes each message, including its link, to the server log instead of sending it. Admins
also see invitation links on screen when they invite someone.

## Before you begin

- You're signed in as an admin, or you can set environment variables on the deployment.
- A sender address on a domain your mail provider or Cloudflare lets you send from.

## Where settings come from

You can configure email in **Settings** > **Email** or with environment variables. Environment variables win: a field
they set is locked in Settings.

| Setting | Environment variable | Settings field |
| --- | --- | --- |
| Sender | `NUXT_MAIL_FROM` | **From address** |
| SMTP server (Node only) | `NUXT_MAIL_SMTP_URL` | **Host**, **Port**, **Security**, **Username**, **Password** |

`NUXT_MAIL_SMTP_URL` locks the whole SMTP section. Values saved in Settings are kept while an environment variable
overrides them, and apply again if you remove the variable. The SMTP password is stored encrypted with a key derived
from `NUXT_APP_SECRET`.

## Set up SMTP on Node or Docker

1. Go to **Settings** > **Email**.
2. Enter a **From address**, such as `Ticketer <support@example.com>`.
3. Under **SMTP server**, enter the **Host** and **Port**, and choose the **Security**:
   - **STARTTLS**: connect, then upgrade to TLS. Usually port 587.
   - **TLS**: TLS from the start. Usually port 465.
   - **None**: no encryption. Use only for a relay on your own network.
4. Enter the **Username** and **Password** your provider gives you.
5. Select **Save**.
6. [Send a test message](#send-a-test-message).

### Common providers

Check your provider's documentation for current values.

| Provider | Host | Port and security | Username |
| --- | --- | --- | --- |
| Gmail or Google Workspace | `smtp.gmail.com` | 465 TLS or 587 STARTTLS | Your address; the password is an app password |
| Microsoft 365 | `smtp.office365.com` | 587 STARTTLS | Your address |
| Amazon SES | `email-smtp.<region>.amazonaws.com` | 587 STARTTLS or 465 TLS | SMTP credentials created in SES |
| Postmark | `smtp.postmarkapp.com` | 587 STARTTLS | Server API token (also the password) |
| Mailgun | `smtp.mailgun.org` (EU: `smtp.eu.mailgun.org`) | 587 STARTTLS | SMTP login from Mailgun |
| SendGrid | `smtp.sendgrid.net` | 587 STARTTLS | `apikey`; the password is an API key |
| Resend | `smtp.resend.com` | 465 TLS or 587 STARTTLS | `resend`; the password is an API key |

### Use an environment variable instead

Set `NUXT_MAIL_SMTP_URL` to an SMTP connection URL:

```bash
NUXT_MAIL_SMTP_URL='smtps://<user>:<password>@smtp.example.com:465'
NUXT_MAIL_FROM='Ticketer <support@example.com>'
```

Use `smtps://` for TLS (usually port 465). Use `smtp://` for port 587; add `?requireTLS=true` to refuse servers
that don't offer STARTTLS, which is what **Settings** does for **STARTTLS**. Percent-encode special
characters in the user name and password, for example `@` as `%40`. On Docker, `docker-compose.prod.yml` passes
`NUXT_MAIL_SMTP_URL` to the container as a Compose secret.

## Set up Cloudflare Email Sending

On Cloudflare, mail goes through the `EMAIL` send_email binding. SMTP isn't available, and the **SMTP server**
section is hidden.

1. In the Cloudflare dashboard, onboard your sending domain to Email Sending.
2. Add the `EMAIL` binding to the Worker: build with `CF_SEND_EMAIL=true`, or add
   `"send_email": [{ "name": "EMAIL" }]` to `wrangler.jsonc`. Then deploy again.
3. In Ticketer, go to **Settings** > **Email**, enter a **From address** on the onboarded domain, and select **Save**.
   You can set `NUXT_MAIL_FROM` instead.
4. [Send a test message](#send-a-test-message).

## Send a test message

1. Go to **Settings** > **Email**.
2. Under **Send a test message**, enter an address. It defaults to yours.
3. Select **Send test**.

The test uses the saved settings, so save first. If sending fails, Ticketer shows the reason, for example
`The mail server refused the message: …`, `Set a sender address first`, or `No mail transport is configured`.

The status at the top of the page tells you whether mail is sending. **Settings** > **Overview** shows the same
status.

## What's next

- [Invite people and manage roles](/admin/invite-people)
- [Troubleshooting](/reference/troubleshooting#email-isn-t-sent)
- [Environment variables](/reference/environment-variables#email)
