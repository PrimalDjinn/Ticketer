# Recipes

Each recipe adds two routes to the product, behind its own sign-in:

- `GET /support?target=new-ticket|chat|tickets|ticket`: signs the person in to Ticketer and lands them there. It
  opens no ticket, so a plain link is fine. (It may create the person's external account in Ticketer, which is
  harmless.)
- `POST /support/report`: opens a ticket from a form in the product, then lands on it. It's a `POST` so that
  crawlers, link previews and prefetchers never open tickets.

Both make the login link when the person clicks: the link works once, within 5 minutes. Replace the
"current user" lookup with the product's own auth. The user needs `id`, `email` and `name`.

When Ticketer answers `409`, the person is on the Ticketer team, or invited to it. Show a message asking them to sign
in to Ticketer directly, at `TICKETER_URL`.

`returnUrl` comes from the `Referer` header below. That's safe, because Ticketer ignores return URLs whose origin
isn't allowed for the app, but the header can be missing: fall back to the product's home page. Protect the `POST`
routes with the product's usual CSRF defence. Escape ticket titles when you render them: people outside the team
write them.

## Contents

- [Node.js helper](#nodejs-helper)
- [Express](#express)
- [Next.js (App Router)](#nextjs-app-router)
- [Python helper, Flask and Django](#python-helper-flask-and-django)
- [Laravel](#laravel)
- [Rails](#rails)
- [Show the person's tickets](#show-the-persons-tickets)

## Node.js helper

Node.js 18 or later (built-in `fetch`). Server only.

```js
// ticketer.js
const TARGETS = new Set(['new-ticket', 'chat', 'tickets', 'ticket'])

export class TicketerTeamError extends Error {}
/** Opening a ticket timed out: it may still have been created, so don't resend. */
export class TicketerMaybeCreatedError extends Error {}

export async function ticketerLoginLink(user, { target, ticketId, ticket, returnUrl } = {}) {
  const wanted = TARGETS.has(target) ? target : undefined
  let response
  try {
    response = await fetch(`${process.env.TICKETER_URL}/api/integrations/v1/sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${process.env.TICKETER_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        name: user.name,
        externalId: String(user.id),
        target: wanted,
        ticketId: wanted === 'ticket' ? Number(ticketId) : undefined,
        ticket,
        returnUrl,
      }),
      // Opening a ticket does more work than a sign-in.
      signal: AbortSignal.timeout(ticket ? 30_000 : 10_000),
    })
  } catch (error) {
    if (ticket && error.name === 'TimeoutError') throw new TicketerMaybeCreatedError('Ticketer did not answer in time')
    throw error
  }
  const body = await response.json().catch(() => ({}))
  if (response.status === 409) throw new TicketerTeamError(body.message)
  if (!response.ok) {
    throw Object.assign(new Error(`Ticketer ${response.status}: ${body.message ?? response.statusText}`), { status: response.status })
  }
  return body // { url, expiresAt, userId, created, ticket? }
}

/** Context that helps support staff: never secrets, tokens or payment details. */
export function reportContext(req, extra = {}) {
  return {
    page: String(req.headers.referer ?? '').slice(0, 2000),
    browser: String(req.headers['user-agent'] ?? '').slice(0, 2000),
    ...extra,
  }
}
```

## Express

```js
import express from 'express'
import { ticketerLoginLink, reportContext, TicketerTeamError, TicketerMaybeCreatedError } from './ticketer.js'

const APP_URL = process.env.APP_URL ?? 'http://localhost:3000' // the product's own address

const app = express()
app.use(express.urlencoded({ extended: false }))

// requireLogin is the product's own middleware; it sets req.user.
app.get('/support', requireLogin, async (req, res, next) => {
  try {
    const { url } = await ticketerLoginLink(req.user, {
      target: req.query.target,
      ticketId: req.query.ticketId, // with target=ticket; Ticketer answers 404 unless it's theirs or public
      returnUrl: req.get('referer') ?? APP_URL,
    })
    res.redirect(303, url)
  } catch (error) {
    if (error instanceof TicketerTeamError) return res.status(409).send('You are on the support team: sign in to Ticketer directly.')
    if (error.status === 404) return res.status(404).send('That issue was not found.')
    if (error.status === 400) return res.status(400).send('That link is not valid.')
    next(error)
  }
})

app.post('/support/report', requireLogin, async (req, res, next) => {
  try {
    const title = String(req.body.title ?? '').trim().slice(0, 140) || 'Problem report'
    const { url } = await ticketerLoginLink(req.user, {
      ticket: {
        title,
        description: String(req.body.description ?? '').slice(0, 8000) || undefined,
        context: reportContext(req, { plan: req.user.plan ?? '' }),
      },
      returnUrl: req.get('referer') ?? APP_URL,
    })
    res.redirect(303, url) // lands on the new ticket
  } catch (error) {
    if (error instanceof TicketerTeamError) return res.status(409).send('You are on the support team: sign in to Ticketer directly.')
    if (error instanceof TicketerMaybeCreatedError) {
      return res.status(504).send('Your report may have been received. Check your open issues before sending it again.')
    }
    next(error)
  }
})
```

```html
<a href="/support?target=chat">Contact support</a>

<form method="post" action="/support/report">
  <input name="title" maxlength="140" required placeholder="What went wrong?" />
  <textarea name="description" maxlength="8000"></textarea>
  <button>Report a problem</button>
</form>
```

## Next.js (App Router)

`app/support/route.ts`. Link to it with a plain `<a href="/support?target=chat">`, not `<Link>`: `<Link>` prefetches.

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { ticketerLoginLink, TicketerTeamError } from '@/lib/ticketer' // the Node.js helper above
import { getCurrentUser } from '@/lib/auth' // the product's own auth

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url))
  try {
    const { url } = await ticketerLoginLink(user, {
      target: request.nextUrl.searchParams.get('target') ?? undefined,
      returnUrl: request.headers.get('referer') ?? undefined,
    })
    return NextResponse.redirect(url, 303)
  } catch (error) {
    if (error instanceof TicketerTeamError) {
      return new NextResponse('You are on the support team: sign in to Ticketer directly.', { status: 409 })
    }
    throw error
  }
}
```

`app/support/report/route.ts` takes the form post:

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { ticketerLoginLink } from '@/lib/ticketer'
import { getCurrentUser } from '@/lib/auth'

export async function POST(request: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.redirect(new URL('/login', request.url), 303)
  const form = await request.formData()
  const title = String(form.get('title') ?? '').trim().slice(0, 140) || 'Problem report'
  const description = String(form.get('description') ?? '').slice(0, 8000) || undefined
  const page = request.headers.get('referer') ?? ''
  const { url } = await ticketerLoginLink(user, {
    ticket: { title, description, context: { page, browser: request.headers.get('user-agent') ?? '' } },
    returnUrl: page || undefined,
  })
  return NextResponse.redirect(url, 303)
}
```

## Python helper, Flask and Django

Uses [Requests](https://requests.readthedocs.io).

```python
# ticketer.py
import os

import requests

TARGETS = {"new-ticket", "chat", "tickets"}


class TicketerTeamError(Exception):
    pass


def ticketer_login_link(user, target=None, ticket=None, return_url=None):
    body = {"email": user["email"], "name": user["name"], "externalId": str(user["id"])}
    if target in TARGETS:
        body["target"] = target
    if ticket:
        body["ticket"] = ticket
    if return_url:
        body["returnUrl"] = return_url
    response = requests.post(
        f"{os.environ['TICKETER_URL']}/api/integrations/v1/sessions",
        headers={"Authorization": f"Bearer {os.environ['TICKETER_API_KEY']}"},
        json=body,
        timeout=10,
    )
    if response.status_code == 409:
        raise TicketerTeamError(response.json().get("message"))
    if not response.ok:
        raise RuntimeError(f"Ticketer {response.status_code}: {response.text[:300]}")
    return response.json()  # {"url", "expiresAt", "userId", "created", "ticket"?}
```

Flask:

```python
from flask import Flask, redirect, request

from ticketer import TicketerTeamError, ticketer_login_link

app = Flask(__name__)


@app.get("/support")
@login_required  # the product's own decorator
def support():
    try:
        link = ticketer_login_link(current_user_dict(), target=request.args.get("target"),
                                   return_url=request.referrer)
    except TicketerTeamError:
        return "You are on the support team: sign in to Ticketer directly.", 409
    return redirect(link["url"], code=303)


@app.post("/support/report")
@login_required
def report():
    title = (request.form.get("title") or "").strip()[:140] or "Problem report"
    ticket = {
        "title": title,
        "description": (request.form.get("description") or "")[:8000] or None,
        "context": {"page": request.referrer or "", "browser": request.user_agent.string[:2000]},
    }
    ticket = {k: v for k, v in ticket.items() if v is not None}
    link = ticketer_login_link(current_user_dict(), ticket=ticket, return_url=request.referrer)
    return redirect(link["url"], code=303)
```

Django (`views.py`; protect `report` with Django's CSRF middleware as usual):

```python
from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseRedirect
from django.views.decorators.http import require_GET, require_POST

from .ticketer import TicketerTeamError, ticketer_login_link


def _user(request):
    u = request.user
    return {"id": u.pk, "email": u.email, "name": u.get_full_name() or u.get_username()}


class SeeOther(HttpResponseRedirect):
    status_code = 303
    allowed_schemes = ["http", "https"]


@login_required
@require_GET
def support(request):
    try:
        link = ticketer_login_link(_user(request), target=request.GET.get("target"),
                                   return_url=request.META.get("HTTP_REFERER"))
    except TicketerTeamError:
        return HttpResponse("You are on the support team: sign in to Ticketer directly.", status=409)
    return SeeOther(link["url"])


@login_required
@require_POST
def report(request):
    title = request.POST.get("title", "").strip()[:140] or "Problem report"
    ticket = {"title": title, "context": {"page": request.META.get("HTTP_REFERER", "")}}
    if request.POST.get("description"):
        ticket["description"] = request.POST["description"][:8000]
    link = ticketer_login_link(_user(request), ticket=ticket, return_url=request.META.get("HTTP_REFERER"))
    return SeeOther(link["url"])
```

## Laravel

```php
// app/Http/Controllers/SupportController.php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;

class SupportController extends Controller
{
    private function loginLink(Request $request, array $extra = [])
    {
        $user = $request->user();
        $response = Http::withToken(config('services.ticketer.key'))
            ->timeout(10)
            ->post(config('services.ticketer.url') . '/api/integrations/v1/sessions', array_filter([
                'email' => $user->email,
                'name' => $user->name,
                'externalId' => (string) $user->id,
                'returnUrl' => $request->headers->get('referer'),
            ] + $extra));

        if ($response->status() === 409) {
            abort(409, 'You are on the support team: sign in to Ticketer directly.');
        }
        $response->throw();

        return $response->json('url');
    }

    public function open(Request $request)
    {
        $target = in_array($request->query('target'), ['new-ticket', 'chat', 'tickets'], true) ? $request->query('target') : null;

        return redirect()->away($this->loginLink($request, array_filter(['target' => $target])), 303);
    }

    public function report(Request $request)
    {
        $data = $request->validate(['title' => 'required|string|max:140', 'description' => 'nullable|string|max:8000']);

        return redirect()->away($this->loginLink($request, ['ticket' => array_filter([
            'title' => $data['title'],
            'description' => $data['description'] ?? null,
            'context' => ['page' => (string) $request->headers->get('referer')],
        ])]), 303);
    }
}
```

In `config/services.php`, add `'ticketer' => ['url' => env('TICKETER_URL'), 'key' => env('TICKETER_API_KEY')]`. Routes:
`Route::middleware('auth')->get('/support', [SupportController::class, 'open'])` and
`Route::middleware('auth')->post('/support/report', [SupportController::class, 'report'])`.

## Rails

```ruby
# app/controllers/support_controller.rb
require "net/http"

class SupportController < ApplicationController
  before_action :authenticate_user! # the product's own auth

  TARGETS = %w[new-ticket chat tickets].freeze

  def open
    target = TARGETS.include?(params[:target]) ? params[:target] : nil
    redirect_to login_link(target: target), allow_other_host: true, status: :see_other
  end

  def report
    ticket = { title: params.require(:title).to_s.strip[0, 140], context: { page: request.referer.to_s } }
    ticket[:description] = params[:description].to_s[0, 8000] if params[:description].present?
    redirect_to login_link(ticket: ticket), allow_other_host: true, status: :see_other
  end

  private

  def login_link(extra)
    uri = URI("#{ENV.fetch('TICKETER_URL')}/api/integrations/v1/sessions")
    body = { email: current_user.email, name: current_user.name, externalId: current_user.id.to_s,
             returnUrl: request.referer }.merge(extra).compact
    response = Net::HTTP.post(uri, body.to_json, "Content-Type" => "application/json",
                              "Authorization" => "Bearer #{ENV.fetch('TICKETER_API_KEY')}")
    if response.code == "409"
      render(plain: "You are on the support team: sign in to Ticketer directly.", status: :conflict) and return
    end
    raise "Ticketer #{response.code}: #{response.body[0, 300]}" unless response.is_a?(Net::HTTPSuccess)

    JSON.parse(response.body).fetch("url")
  end
end
```

Routes: `get "/support", to: "support#open"` and `post "/support/report", to: "support#report"`.

## Show the person's tickets

Fetch on the server and render a list. Link each ticket through the product's `/support` route with
`target=ticket` and `ticketId`, so the person is signed in when they click, or use `publicUrl` when it isn't null.

```js
export async function ticketerTickets(email, status = 'open') {
  const params = new URLSearchParams({ email, status, limit: '20' })
  const response = await fetch(`${process.env.TICKETER_URL}/api/integrations/v1/tickets?${params}`, {
    headers: { authorization: `Bearer ${process.env.TICKETER_API_KEY}` },
    signal: AbortSignal.timeout(10_000),
  })
  if (response.status === 409) return [] // staff: they use Ticketer directly
  if (!response.ok) throw new Error(`Ticketer ${response.status}`)
  return response.json() // [{ id, reference, title, status, urgency, visibility, createdAt, updatedAt, url, publicUrl }]
}
```

Link each item as `/support?target=ticket&ticketId=<id>`; the Node.js helper and the Express route above pass both on.
Render titles as text, escaped, never as HTML.
