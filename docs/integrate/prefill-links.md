# Create prefill links

This page shows you how to open Ticketer's report form with fields already filled in, using a plain link. A prefill
link needs no secret and doesn't sign anyone in: the person is already signed in, signs in, or continues as a guest,
and can edit everything before they send it.

## Before you begin

- The **App ID** of an app in **Settings** > **Integrations**. See [Connect an app](/admin/integrations). The app must
  be turned on.

## Build the link

Link to `GET /launch` with `app` and any of these parameters, without `email` or `sig`:

| Parameter | Fills in |
| --- | --- |
| `title` | **Title** (up to 140 characters) |
| `description` | **Description** (up to 8,000 characters) |
| `urgency` | **Urgency**: `Default`, `Urgent` or `Emergency` |
| `context[<key>]` | A `key: value` line in the "Reported from" section under the description |
| `return_url` | A **Back to** link, if its origin is allowed for the app |

Percent-encode every value. For example:

```text
https://tickets.example.com/launch?app=<app-id>&title=Export%20fails&description=Clicking%20Export%20shows%20an%20error.&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports
```

Replace `https://tickets.example.com` with your Ticketer address and `<app-id>` with the app ID.

In HTML:

```html
<a href="https://tickets.example.com/launch?app=<app-id>&amp;title=Export%20fails&amp;context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports"
   target="_blank" rel="noopener">Report a problem</a>
```

## What the person sees

Ticketer redirects to the report form with the fields filled in, and a note **Reporting from** followed by your app's
name. When you send a description or context, the description ends with a "Reported from" section that names your
app and lists the context entries. It's part of the description, so the person can see and edit it.

If a parameter is invalid, for example a title longer than 140 characters, the form opens empty. If the app doesn't
exist or is turned off, the person lands on the sign-in page with an explanation.

## What's next

- [Signed launch links](/integrate/signed-links)
- [Choose a flow](/integrate/)
