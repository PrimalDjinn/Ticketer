# Sign a launch link

A signed launch link is `GET <TICKETER_URL>/launch?<canonical string>&sig=<signature>`. The product's backend builds
it with the app's signing secret; Ticketer checks it when the browser opens it. No call to Ticketer is needed.

## Algorithm

1. Take every query parameter except `sig`. Required: `app`, `email`, `ts` (now, in Unix seconds), `nonce` (a new
   random value of 16 to 128 characters from `A-Z a-z 0-9 - _`). Optional: `name`, `external_id`, `target`,
   `ticket_id`, `title`, `description`, `urgency`, `context[<key>]`, `return_url`.
2. Percent-encode each name and each value as RFC 3986 says: every byte of the UTF-8 text as `%XX` with uppercase hex,
   except `A-Z a-z 0-9 - _ . ~`. A space is `%20` (never `+`), `[` is `%5B`, `@` is `%40`.
3. Sort the pairs by encoded name, in byte order.
4. Join them as `name=value` with `&`. That's the canonical string.
5. `sig` is HMAC-SHA256 of the canonical string, keyed with the signing secret, as lowercase hex.
6. The URL is `<TICKETER_URL>/launch?` + canonical string + `&sig=` + `sig`. Use the canonical string itself as the
   query, so the encoding Ticketer sees is the one you signed.

Each parameter may appear only once. Pass context entries as flat names, such as `context[url]`, not nested objects.

## Worked example

Secret `tks_example_secret` and these parameters:

| Name | Value |
| --- | --- |
| `app` | `app_01jexample0000000000000000` |
| `email` | `jane@example.com` |
| `name` | `Jane Doe` |
| `context[url]` | `https://app.example.com/reports?id=7` |
| `ts` | `1764000000` |
| `nonce` | `9f86d081884c7d659a2feaa0c55ad015` |

Canonical string:

```text
app=app_01jexample0000000000000000&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports%3Fid%3D7&email=jane%40example.com&name=Jane%20Doe&nonce=9f86d081884c7d659a2feaa0c55ad015&ts=1764000000
```

Signature:

```text
7f8e75a7f00a6de5120539b49061aa082d432669cfea9d9de7b7a841e32b8a96
```

Run `node scripts/check-signature.mjs` to reproduce it. Make your implementation produce the same two strings for these
inputs before you test in a browser.

## RFC 3986 encoders

| Language | Encoder |
| --- | --- |
| JavaScript | `encodeURIComponent(v)`, then also encode `!`, `'`, `(`, `)` and `*` |
| Python 3.7 or later | `urllib.parse.quote(v, safe="")` |
| PHP | `rawurlencode($v)` |

Don't use `URLSearchParams`, `urllib.parse.urlencode` or `http_build_query` to build the canonical string: they encode
spaces as `+` or leave other characters alone.

## Node.js

```js
import { createHmac, randomBytes } from 'node:crypto'

const encode = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())

export function ticketerLaunchUrl(params) {
  const all = {
    ...params,
    app: process.env.TICKETER_APP_ID,
    ts: String(Math.floor(Date.now() / 1000)),
    nonce: randomBytes(16).toString('hex'),
  }
  const canonical = Object.entries(all)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [encode(name), encode(String(value))])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, value]) => `${name}=${value}`)
    .join('&')
  const sig = createHmac('sha256', process.env.TICKETER_SIGNING_SECRET).update(canonical).digest('hex')
  return `${process.env.TICKETER_URL}/launch?${canonical}&sig=${sig}`
}

// ticketerLaunchUrl({ email: user.email, name: user.name, external_id: user.id, target: 'chat' })
```

## Python

```python
import hashlib
import hmac
import os
import secrets
import time
from urllib.parse import quote


def ticketer_launch_url(params):
    params = {
        **{k: v for k, v in params.items() if v is not None},
        "app": os.environ["TICKETER_APP_ID"],
        "ts": str(int(time.time())),
        "nonce": secrets.token_hex(16),
    }
    pairs = sorted((quote(str(k), safe=""), quote(str(v), safe="")) for k, v in params.items())
    canonical = "&".join(f"{k}={v}" for k, v in pairs)
    sig = hmac.new(
        os.environ["TICKETER_SIGNING_SECRET"].encode(), canonical.encode(), hashlib.sha256
    ).hexdigest()
    return f"{os.environ['TICKETER_URL']}/launch?{canonical}&sig={sig}"
```

## PHP

```php
<?php
function ticketer_launch_url(array $params): string
{
    $params['app'] = getenv('TICKETER_APP_ID');
    $params['ts'] = (string) time();
    $params['nonce'] = bin2hex(random_bytes(16));

    $pairs = [];
    foreach ($params as $name => $value) {
        if ($value === null) continue;
        $pairs[rawurlencode((string) $name)] = rawurlencode((string) $value);
    }
    ksort($pairs, SORT_STRING);

    $parts = [];
    foreach ($pairs as $name => $value) {
        $parts[] = $name . '=' . $value;
    }
    $canonical = implode('&', $parts);
    $sig = hash_hmac('sha256', $canonical, getenv('TICKETER_SIGNING_SECRET'));

    return getenv('TICKETER_URL') . '/launch?' . $canonical . '&sig=' . $sig;
}
```

## Other languages

Port the algorithm above, then check it against the worked example. Common mistakes:

- Encoding a space as `+`, or leaving `!`, `'`, `(`, `)` or `*` unencoded.
- Encoding `~`, which must stay as it is.
- Sorting before encoding, or sorting case-insensitively. Sort the encoded names, byte by byte.
- Leaving `app`, `ts` or `nonce` out of the signed string.
- Re-encoding the query after signing, for example by passing the parameters to a URL builder.
- Reusing a nonce, or making the link long before the click: Ticketer accepts `ts` up to 5 minutes old.
