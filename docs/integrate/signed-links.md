# Create signed launch links

This page shows you how your backend builds a browser link that signs a person in to Ticketer, without calling
Ticketer first. Your backend signs the link with the app's signing secret; the browser opens it, and Ticketer checks
the signature, signs the person in and redirects them.

A signed link is accepted for 5 minutes after its timestamp, and only once.

## Before you begin

- An app in **Settings** > **Integrations**, its **App ID** and its signing secret. See
  [Connect an app](/admin/integrations).
- The signing secret on your server, for example in `TICKETER_SIGNING_SECRET`. Never send it to a browser.
- A server clock that is correct to within a minute.

## Parameters

A launch link is `GET /launch` with these query parameters:

| Parameter | Required | Description |
| --- | --- | --- |
| `app` | Yes | The app ID, such as `app_01j…`. |
| `email` | Yes | The person's email address. |
| `ts` | Yes | Current time in Unix seconds. |
| `nonce` | Yes | A new random value for every link: 16 to 128 characters from `A-Z`, `a-z`, `0-9`, `-` and `_`. |
| `sig` | Yes | The signature, 64 hex characters. See below. |
| `name` | No | Display name. |
| `external_id` | No | The person's ID in your app. |
| `target` | No | `new-ticket`, `chat`, `tickets` or `ticket`. |
| `ticket_id` | With `target=ticket` | The ticket to open. |
| `title`, `description`, `urgency`, `context[<key>]` | No | Open a ticket for the person. A ticket is opened only when `title` is present. |
| `return_url` | No | Shown as a **Back to** link if its origin is allowed for the app. |

These are the same parameters, with the same limits, as [Redirect with an API key](/integrate/redirect#query-parameters).
Each parameter may appear only once.

## Sign the link

The signature covers every query parameter except `sig`:

1. Take every query parameter except `sig`.
2. Percent-encode each name and each value as RFC 3986 describes: encode every byte of the UTF-8 text as `%XX` with
   uppercase hex, except `A-Z`, `a-z`, `0-9`, `-`, `_`, `.` and `~`. A space becomes `%20`, `[` becomes `%5B`, and `@`
   becomes `%40`.
3. Sort the pairs by encoded name, in byte order.
4. Join them as `name=value` with `&`. This is the canonical string.
5. Compute HMAC-SHA256 of the canonical string, with the signing secret as the key, as lowercase hex. This is `sig`.
6. Build the URL as `https://<ticketer-host>/launch?` + the canonical string + `&sig=` + `sig`.

Use the canonical string itself as the query, as in step 6, so the encoding Ticketer sees is the one you signed.

| Language | RFC 3986 encoder |
| --- | --- |
| JavaScript | `encodeURIComponent(v)`, then encode `!`, `'`, `(`, `)` and `*`, which it leaves alone |
| Python 3.7 or later | `urllib.parse.quote(v, safe="")` |
| PHP | `rawurlencode($v)` |

### Check your implementation

With the signing secret `tks_example_secret` and these parameters:

| Name | Value |
| --- | --- |
| `app` | `app_01jexample0000000000000000` |
| `email` | `jane@example.com` |
| `name` | `Jane Doe` |
| `context[url]` | `https://app.example.com/reports?id=7` |
| `ts` | `1764000000` |
| `nonce` | `9f86d081884c7d659a2feaa0c55ad015` |

the canonical string is:

```text
app=app_01jexample0000000000000000&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports%3Fid%3D7&email=jane%40example.com&name=Jane%20Doe&nonce=9f86d081884c7d659a2feaa0c55ad015&ts=1764000000
```

and `sig` is:

```text
7f8e75a7f00a6de5120539b49061aa082d432669cfea9d9de7b7a841e32b8a96
```

## Node.js example

```js
import { createHmac, randomBytes } from 'node:crypto'

const TICKETER_URL = 'https://tickets.example.com'

// RFC 3986: encodeURIComponent, plus the five characters it leaves unencoded.
function encode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
}

export function ticketerLaunchUrl(params) {
  const all = {
    ...params,
    app: process.env.TICKETER_APP_ID,
    ts: String(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(16).toString('hex'),
  }
  const canonical = Object.entries(all)
    .map(([name, value]) => [encode(name), encode(String(value))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  const sig = createHmac('sha256', process.env.TICKETER_SIGNING_SECRET).update(canonical).digest('hex')
  return `${TICKETER_URL}/launch?${canonical}&sig=${sig}`
}
```

Use it behind your "Report a problem" button, for example in an Express route:

```js
app.get('/report-a-problem', (req, res) => {
  res.redirect(
    ticketerLaunchUrl({
      email: req.user.email,
      name: req.user.name,
      external_id: req.user.id,
      title: 'Export fails',
      'context[url]': req.get('referer') ?? '',
      return_url: 'https://app.example.com/reports',
    }),
  )
})
```

## Python example

```python
import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import quote

TICKETER_URL = "https://tickets.example.com"


def ticketer_launch_url(params):
    params = {
        **params,
        "app": os.environ["TICKETER_APP_ID"],
        "ts": str(int(time.time())),
        "nonce": secrets.token_hex(16),
    }
    # quote(..., safe="") percent-encodes everything except A-Z a-z 0-9 - _ . ~
    pairs = sorted((quote(str(k), safe=""), quote(str(v), safe="")) for k, v in params.items())
    canonical = "&".join(f"{k}={v}" for k, v in pairs)
    sig = hmac.new(
        os.environ["TICKETER_SIGNING_SECRET"].encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()
    return f"{TICKETER_URL}/launch?{canonical}&sig={sig}"
```

For example, `ticketer_launch_url({"email": "jane@example.com", "name": "Jane", "target": "chat"})`.

## PHP example

```php
<?php
const TICKETER_URL = 'https://tickets.example.com';

function ticketer_launch_url(array $params): string
{
    $params['app'] = getenv('TICKETER_APP_ID');
    $params['ts'] = (string) time();
    $params['nonce'] = bin2hex(random_bytes(16));

    // rawurlencode follows RFC 3986: everything except A-Z a-z 0-9 - _ . ~ is encoded.
    $pairs = [];
    foreach ($params as $name => $value) {
        $pairs[rawurlencode((string) $name)] = rawurlencode((string) $value);
    }
    ksort($pairs, SORT_STRING);

    $parts = [];
    foreach ($pairs as $name => $value) {
        $parts[] = $name . '=' . $value;
    }
    $canonical = implode('&', $parts);
    $sig = hash_hmac('sha256', $canonical, getenv('TICKETER_SIGNING_SECRET'));

    return TICKETER_URL . '/launch?' . $canonical . '&sig=' . $sig;
}
```

Pass context entries as flat keys, such as `['context[url]' => $url]`, not as a nested array.

In every example, replace `https://tickets.example.com` with your Ticketer address, and set `TICKETER_APP_ID` and
`TICKETER_SIGNING_SECRET` in your server's environment.

## What Ticketer checks

When the browser opens the link, Ticketer checks, in this order:

1. The app exists and is turned on.
2. `ts`, `nonce` and `sig` are present and well formed.
3. The signature matches. This comes before the nonce check, so strangers can't use up your nonces.
4. `ts` is no more than 5 minutes old and no more than 1 minute in the future.
5. The nonce hasn't been used with this app before.
6. The other parameters are valid, for example `email` is an email address.
7. The person isn't on the team, and has an account or the app may create one.

If everything passes, Ticketer signs the person in, opens the ticket if you sent `title`, and redirects to the target.
If the browser already has a guest session and Ticketer creates a new account, the guest's tickets and chats move to
it. If a check fails, the person lands on the sign-in page with an explanation. See
[Errors](/integrate/errors#browser-link-errors).

## What's next

- [Prefill links](/integrate/prefill-links)
- [Security model](/integrate/security)
- [Errors](/integrate/errors)
