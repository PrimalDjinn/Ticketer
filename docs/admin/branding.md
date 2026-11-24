# Brand your site

This page explains how to show your organisation's name, logo and colour in Ticketer: in the app, on the public help
and status pages, in page titles, in the browser tab, and in emails.

Only admins can change branding.

## Set the name, logo, colour and website

1. Open **Settings**, then **Branding**.
2. Under **Logo**, select **Upload logo** and choose an image. To change it later, select **Replace**; to go back to
   the Ticketer mark, select **Remove**.
3. In **Name**, enter your organisation or product, such as `Acme Support`.
4. Under **Accent colour**, select a colour. The page previews it as you pick.
5. Optional: in **Website**, enter your site's address, such as `https://example.com`.
6. Select **Save**.

The new branding applies to everyone the next time they load a page. A new logo applies at once.

| Setting | Where it shows |
| --- | --- |
| Name | Next to the logo in the sidebar and on the public and sign-in pages, at the end of every page title, as the title of push notifications, and in email subjects and headers. Until you set one, it's **Ticketer**. |
| Logo | Same places as the name, and as the browser tab icon. Emails show it instead of the name. |
| Accent colour | Buttons, links, highlights and the email buttons. |
| Website | A link in the footer of the public pages. |

## Logo requirements

- PNG, JPEG, WebP or SVG, up to 512 KB.
- It's shown about 32 pixels tall, so a wide logo works. Use a transparent background so it works in dark mode too.
- Emails use PNG, JPEG and WebP logos only, because many mail apps don't show SVG. With an SVG logo, emails show the
  name instead.
- Logos in emails link to your site's address, which Ticketer learns when someone in the team opens it. Set
  `NUXT_SITE_URL` to fix the address. See [Environment variables](/reference/environment-variables#site-address).

Logos are public: anyone can load them, as with any website logo.

## Set the name with an environment variable

To fix the name for a deployment, set `NUXT_PUBLIC_APP_NAME`. It takes precedence over the **Name** field, which then
shows a lock. The logo, colour and website stay editable in **Settings**.

## What's next

- [Protect forms from bots](/admin/bot-protection)
- [Set up email](/admin/email)
