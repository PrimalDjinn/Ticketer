# Protect forms from bots

This page explains how to add a "not a robot" check to the forms anyone can use without an account, using Cloudflare
Turnstile or Google reCAPTCHA.

With bot protection on, the check appears on these forms:

| Form | Who sees the check |
| --- | --- |
| **Create account** | People signing up without an invitation. Invited people and the first admin don't. |
| **Forgot your password?** | Everyone. |
| **Report an issue** (`/tickets/new`) | Visitors who aren't signed in, on their first ticket or chat. |
| **Chat with support** | Visitors who aren't signed in, on their first message. |

People who are signed in, including visitors who already opened a ticket or chat in that browser, never see it.

## Before you begin

Get a site key and a secret key from one of these providers:

- **Cloudflare Turnstile**: free, and usually invisible to people. In the Cloudflare dashboard, go to **Turnstile**,
  select **Add widget**, and add your site's hostname, such as `tickets.example.com`. Widget mode **Managed** works
  well.
- **Google reCAPTCHA v2**: the "I'm not a robot" checkbox. In the
  [reCAPTCHA admin console](https://www.google.com/recaptcha/admin/create), choose **Challenge (v2)**, then **"I'm not
  a robot" Checkbox**, and add your hostname. reCAPTCHA v3 and Enterprise keys don't work.

## Turn on bot protection in Settings

1. Open **Settings**, then **Bot protection**.
2. Under **Provider**, select **Cloudflare Turnstile** or **Google reCAPTCHA v2**.
3. Enter the **Site key** and the **Secret key**.
4. Select **Save**.
5. Under **Try it**, complete the check and select **Verify**. **It works** means the two keys belong together.

The secret key is encrypted before it's saved and is never shown again. To replace it, enter a new one; to keep it,
leave the field empty.

To turn bot protection off, select **Off** under **Provider** and select **Save**.

## Turn on bot protection with environment variables

Set these variables on the server:

```sh
NUXT_CAPTCHA_PROVIDER=turnstile   # or recaptcha, or none
NUXT_CAPTCHA_SITE_KEY=0x4AAAAAAA…
NUXT_CAPTCHA_SECRET_KEY=0x4AAAAAAA…
```

Each variable takes precedence over its field in **Settings**, which then shows a lock. You can mix them, for example
the provider and site key in Settings and the secret key in a secret environment variable. On Cloudflare, add the
secret key with `wrangler secret put NUXT_CAPTCHA_SECRET_KEY`.

## How the check works

- The browser gets a token from the provider and sends it with the form. Ticketer asks the provider whether the token
  is genuine before it creates the account, guest, ticket or chat.
- Each token works once. If a form is rejected, the check resets so the person can try again.
- If only one key is set, the check isn't shown and forms aren't checked. **Settings** shows what's missing.
- If the provider rejects your keys or can't be reached, forms show **The robot check is unavailable right now** and
  aren't accepted, so bots can't slip through. The server log shows the reason under the tag `[captcha]`.

## Troubleshooting

### The check doesn't appear

- Check that **Settings → Bot protection** shows **Protected by …**. If it shows **Not active yet**, add the missing
  key.
- Ad and script blockers can block the provider. The form then says the check couldn't load.

### Verify fails with "The provider rejected the keys"

The site key and secret key don't belong together, or the hostname isn't on the widget. Copy both keys again from the
same widget, and check its hostnames.

### People see "The robot check expired or failed"

The token expired, typically after a few minutes on the page, or the provider decided the visitor is a bot. Completing
the check again fixes it.

## What's next

- [Control who can sign up](/admin/sign-up)
- [Environment variables](/reference/environment-variables#bot-protection)
