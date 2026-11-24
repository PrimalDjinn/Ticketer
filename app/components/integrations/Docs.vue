<script setup lang="ts">
/** Copy-pasteable instructions for each way in, filled with this site's origin and the chosen app's id. */
const props = defineProps<{ apps: IntegrationAppDTO[] }>()

const origin = useRequestURL().origin
const selected = ref<string | undefined>(props.apps[0]?.id)
watch(
  () => props.apps.map((a) => a.id).join(),
  () => {
    if (!props.apps.some((a) => a.id === selected.value)) selected.value = props.apps[0]?.id
  },
)
const appId = computed(() => selected.value ?? 'app_…')
const appOptions = computed(() => props.apps.map((a) => ({ value: a.id, label: a.name })))

const tab = ref('api')
const tabs = [
  { value: 'api', label: 'Login link (API)', icon: 'i-lucide-server' },
  { value: 'redirect', label: 'Redirect (GET)', icon: 'i-lucide-corner-up-right' },
  { value: 'signed', label: 'Signed link', icon: 'i-lucide-signature' },
  { value: 'prefill', label: 'Prefill only', icon: 'i-lucide-file-pen' },
  { value: 'tickets', label: 'Their tickets', icon: 'i-lucide-list' },
]

const samples = computed(() => {
  const o = origin
  const id = appId.value
  return {
    apiCurl: [
      `curl -X POST ${o}/api/integrations/v1/sessions \\`,
      `  -H "Authorization: Bearer $TICKETER_API_KEY" \\`,
      `  -H "Content-Type: application/json" \\`,
      `  -d '{`,
      `    "email": "jane@example.com",`,
      `    "name": "Jane Doe",`,
      `    "externalId": "user_123",`,
      `    "ticket": {`,
      `      "title": "Export fails",`,
      `      "description": "Clicking Export shows an error.",`,
      `      "urgency": "Urgent",`,
      `      "context": { "url": "https://app.example.com/reports", "plan": "Pro" }`,
      `    },`,
      `    "returnUrl": "https://app.example.com/reports"`,
      `  }'`,
      ``,
      `# 200 {"url":"${o}/launch/…","expiresAt":"…","userId":"…","created":true,"ticket":{"id":42,"reference":"…","url":"…"}}`,
    ].join('\n'),
    apiJs: [
      `// On your server (Node 18+, Bun, Deno, Workers), never in the browser: the key must stay secret.`,
      `async function ticketerLink(user, report) {`,
      `  const res = await fetch('${o}/api/integrations/v1/sessions', {`,
      `    method: 'POST',`,
      `    headers: { authorization: \`Bearer \${process.env.TICKETER_API_KEY}\`, 'content-type': 'application/json' },`,
      `    body: JSON.stringify({`,
      `      email: user.email,`,
      `      name: user.name,`,
      `      externalId: String(user.id),`,
      `      // 'new-ticket' | 'chat' | 'tickets' | 'ticket' (with ticketId); a ticket sent below opens itself`,
      `      target: 'new-ticket',`,
      `      ticket: report && { title: report.title, description: report.description, context: { url: report.url } },`,
      `      returnUrl: report?.url,`,
      `    }),`,
      `  })`,
      `  if (!res.ok) throw new Error((await res.json()).message)`,
      `  const { url } = await res.json()`,
      `  return url // send the browser there within 5 minutes; it works once`,
      `}`,
    ].join('\n'),
    redirectCurl: [
      `# Your backend answers the button click by proxying this redirect (key in a header, never in the URL).`,
      `curl -i "${o}/api/integrations/v1/sessions?email=jane%40example.com&name=Jane&external_id=user_123&title=Export%20fails&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports" \\`,
      `  -H "X-Api-Key: $TICKETER_API_KEY"`,
      ``,
      `# HTTP/1.1 302 Found`,
      `# location: ${o}/launch/…`,
    ].join('\n'),
    signedJs: [
      `import { createHmac, randomBytes } from 'node:crypto'`,
      ``,
      `// RFC 3986: encodeURIComponent also leaves ! ' ( ) * alone, which the signature must encode.`,
      `const enc = (v) => encodeURIComponent(v).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())`,
      ``,
      `export function ticketerLaunchUrl(params) {`,
      `  const all = { ...params, app: '${id}', ts: String(Math.floor(Date.now() / 1000)), nonce: randomBytes(16).toString('hex') }`,
      `  const canonical = Object.entries(all)`,
      `    .map(([k, v]) => [enc(k), enc(String(v))])`,
      `    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))`,
      `    .map(([k, v]) => \`\${k}=\${v}\`)`,
      `    .join('&')`,
      `  const sig = createHmac('sha256', process.env.TICKETER_SIGNING_SECRET).update(canonical).digest('hex')`,
      `  return \`${o}/launch?\${canonical}&sig=\${sig}\``,
      `}`,
      ``,
      `// Behind a "Report a problem" button (the link works once, for 5 minutes):`,
      `res.redirect(ticketerLaunchUrl({`,
      `  email: user.email, name: user.name, external_id: user.id,`,
      `  title: 'Export fails', 'context[url]': req.get('referer') ?? '',`,
      `  return_url: 'https://app.example.com/reports',`,
      `}))`,
    ].join('\n'),
    signedPython: [
      `import hashlib, hmac, os, secrets, time`,
      `from urllib.parse import quote`,
      ``,
      `def ticketer_launch_url(params):`,
      `    params = {**params, "app": "${id}", "ts": str(int(time.time())), "nonce": secrets.token_hex(16)}`,
      `    pairs = sorted((quote(k, safe=""), quote(str(v), safe="")) for k, v in params.items())`,
      `    canonical = "&".join(f"{k}={v}" for k, v in pairs)`,
      `    sig = hmac.new(os.environ["TICKETER_SIGNING_SECRET"].encode(), canonical.encode(), hashlib.sha256).hexdigest()`,
      `    return f"${o}/launch?{canonical}&sig={sig}"`,
      ``,
      `# ticketer_launch_url({"email": "jane@example.com", "name": "Jane", "target": "chat"})`,
    ].join('\n'),
    signedShell: [
      `TS=$(date +%s); NONCE=$(openssl rand -hex 16)`,
      `CANONICAL="app=${id}&email=jane%40example.com&nonce=$NONCE&target=chat&ts=$TS"`,
      `SIG=$(printf '%s' "$CANONICAL" | openssl dgst -sha256 -hmac "$TICKETER_SIGNING_SECRET" -hex | sed 's/^.* //')`,
      `echo "${o}/launch?$CANONICAL&sig=$SIG"`,
    ].join('\n'),
    prefillUrl: `${o}/launch?app=${id}&title=Export%20fails&description=Clicking%20Export%20shows%20an%20error.&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports`,
    prefillHtml: [
      `<a href="${o}/launch?app=${id}&title=Export%20fails&context%5Burl%5D=https%3A%2F%2Fapp.example.com%2Freports"`,
      `   target="_blank" rel="noopener">Report a problem</a>`,
    ].join('\n'),
    ticketsCurl: [
      `curl "${o}/api/integrations/v1/tickets?email=jane%40example.com&status=open" \\`,
      `  -H "Authorization: Bearer $TICKETER_API_KEY"`,
      ``,
      `# [{"id":42,"reference":"…","title":"Export fails","status":"Open","urgency":"Urgent","visibility":"private",`,
      `#   "createdAt":"…","updatedAt":null,"url":"${o}/tickets/42","publicUrl":null}]`,
    ].join('\n'),
  }
})
</script>

<template>
  <section aria-labelledby="integration-docs" class="space-y-4 rounded-lg border border-default p-4 sm:p-6">
    <div class="flex flex-wrap items-start gap-3">
      <div class="min-w-0 flex-1 space-y-1">
        <h2 id="integration-docs" class="font-semibold text-highlighted">How to connect</h2>
        <p class="text-sm text-muted">Pick the flow that suits the other app. Samples use this site's address and the chosen app.</p>
      </div>
      <USelect v-if="apps.length > 1" v-model="selected" :items="appOptions" class="w-full sm:w-56" aria-label="App for the samples" />
    </div>

    <UTabs v-model="tab" :items="tabs" :content="false" size="sm" variant="link" class="w-full overflow-x-auto" />

    <div v-if="tab === 'api'" class="space-y-3 text-sm">
      <p class="text-muted">
        The other app's server asks for a single-use login link and sends the person's browser there. The person is found by
        <code>externalId</code> or email, or created as an external account; anyone on the team is refused (409). With
        <code>ticket</code>, their ticket is opened right away and the link lands on it.
      </p>
      <IntegrationsCodeBlock label="curl" :code="samples.apiCurl" />
      <IntegrationsCodeBlock label="JavaScript" :code="samples.apiJs" />
      <ul class="list-disc space-y-1 pl-5 text-muted">
        <li><code>target</code>: <code>new-ticket</code>, <code>chat</code>, <code>tickets</code>, or <code>ticket</code> with <code>ticketId</code> (one of theirs, or public). Default: the app's landing page.</li>
        <li><code>ticket.urgency</code>: <code>Default</code>, <code>Urgent</code> or <code>Emergency</code>. <code>context</code> entries are listed under “Reported from”.</li>
        <li><code>returnUrl</code> must be on an allowed origin; it shows as “Back to …”.</li>
        <li>Errors: 401 wrong key, 403 app disabled or may not create accounts, 409 the email belongs to the team, 400 invalid input.</li>
      </ul>
    </div>

    <div v-else-if="tab === 'redirect'" class="space-y-3 text-sm">
      <p class="text-muted">
        The same as the login link, as a GET that answers <code>302</code> to it: for backends that can only proxy a redirect. Parameters are
        snake_case: <code>email</code>, <code>name</code>, <code>external_id</code>, <code>target</code>, <code>ticket_id</code>, <code>title</code>,
        <code>description</code>, <code>urgency</code>, <code>context[key]</code>, <code>return_url</code>.
      </p>
      <IntegrationsCodeBlock label="curl" :code="samples.redirectCurl" />
    </div>

    <div v-else-if="tab === 'signed'" class="space-y-3 text-sm">
      <p class="text-muted">
        No server-to-server call: the other app's backend signs a link with the signing secret and the browser opens it. Same parameters as the
        GET flow, plus <code>app</code>, <code>ts</code> (unix seconds), <code>nonce</code> (16–128 of <code>A-Z a-z 0-9 - _</code>, never reused) and
        <code>sig</code>. Links are accepted for 5 minutes (1 minute of clock skew), once.
      </p>
      <div class="rounded-md bg-elevated/50 p-3 text-muted">
        <p class="font-medium text-highlighted">Signing recipe</p>
        <ol class="mt-1 list-decimal space-y-0.5 pl-5">
          <li>Take every query parameter except <code>sig</code>.</li>
          <li>Percent-encode each name and value per RFC 3986: everything except <code>A-Z a-z 0-9 - _ . ~</code>, as UTF-8 bytes with uppercase hex (a space is <code>%20</code>).</li>
          <li>Sort the pairs by encoded name (byte order) and join them as <code>name=value</code> with <code>&amp;</code>.</li>
          <li><code>sig</code> = lowercase hex HMAC-SHA256 of that string, keyed with the signing secret. Send the string as the query, plus <code>&amp;sig=…</code>.</li>
        </ol>
      </div>
      <IntegrationsCodeBlock label="Node.js" :code="samples.signedJs" />
      <IntegrationsCodeBlock label="Python" :code="samples.signedPython" />
      <IntegrationsCodeBlock label="Shell (values already encoded)" :code="samples.signedShell" />
    </div>

    <div v-else-if="tab === 'prefill'" class="space-y-3 text-sm">
      <p class="text-muted">
        A plain link, no secret: opens the new-ticket form filled with <code>title</code>, <code>description</code>, <code>urgency</code> and
        <code>context[key]</code> entries. Nobody is signed in; people sign in (or are already) and can edit everything before sending.
      </p>
      <IntegrationsCodeBlock label="URL" :code="samples.prefillUrl" />
      <IntegrationsCodeBlock label="HTML" :code="samples.prefillHtml" />
    </div>

    <div v-else class="space-y-3 text-sm">
      <p class="text-muted">
        The person's own tickets, newest first, so the other app can show “your open issues”. <code>status</code>: <code>all</code>,
        <code>open</code> (Open, Pending) or <code>closed</code>; <code>limit</code> up to 100.
      </p>
      <IntegrationsCodeBlock label="curl" :code="samples.ticketsCurl" />
    </div>
  </section>
</template>
