<script setup lang="ts">
/**
 * Cloudflare Turnstile or Google reCAPTCHA (v2 checkbox), as configured in Settings → Bot protection. Renders
 * nothing when bot protection is off. `v-model` is the token to send in the `x-captcha-token` header; tokens are
 * single-use, so call `reset()` after a failed submit. `config` overrides the site's settings (Settings preview).
 */
const props = defineProps<{ config?: { provider: CaptchaProvider; siteKey: string } | null }>()
const token = defineModel<string | null>({ default: null })

const { site } = useSite()
const colorMode = useColorMode()
const config = computed(() => (props.config === undefined ? site.value.captcha : props.config))
const el = useTemplateRef<HTMLElement>('el')
const failed = ref(false)
let widgetId: string | number | undefined

interface WidgetApi {
  render(el: HTMLElement, options: Record<string, unknown>): string | number
  reset(id?: string | number): void
  remove?(id: string | number): void
}
declare global {
  interface Window {
    turnstile?: WidgetApi
    grecaptcha?: WidgetApi & { ready?(cb: () => void): void }
    __ticketerCaptchaReady?: () => void
  }
}

const SCRIPTS: Record<CaptchaProvider, string> = {
  turnstile: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__ticketerCaptchaReady',
  recaptcha: 'https://www.google.com/recaptcha/api.js?render=explicit&onload=__ticketerCaptchaReady',
}
const loading = new Map<CaptchaProvider, Promise<WidgetApi>>()

function api(provider: CaptchaProvider) {
  return provider === 'turnstile' ? window.turnstile : window.grecaptcha
}
function load(provider: CaptchaProvider): Promise<WidgetApi> {
  const ready = api(provider)
  if (ready?.render) return Promise.resolve(ready)
  if (!loading.has(provider)) {
    loading.set(
      provider,
      new Promise((resolve, reject) => {
        window.__ticketerCaptchaReady = () => resolve(api(provider)!)
        const script = document.createElement('script')
        script.src = SCRIPTS[provider]
        script.async = true
        script.defer = true
        script.onerror = () => {
          loading.delete(provider)
          reject(new Error('The verification widget could not be loaded'))
        }
        document.head.appendChild(script)
      }),
    )
  }
  return loading.get(provider)!
}

async function mount() {
  unmount()
  const c = config.value
  if (!c || !el.value) return
  failed.value = false
  try {
    const widget = await load(c.provider)
    if (!el.value) return
    el.value.innerHTML = ''
    const theme = colorMode.value === 'dark' ? 'dark' : 'light'
    widgetId = widget.render(el.value, {
      sitekey: c.siteKey,
      theme,
      callback: (value: string) => (token.value = value),
      'expired-callback': () => (token.value = null),
      'error-callback': () => {
        token.value = null
        failed.value = true
      },
      ...(c.provider === 'turnstile' ? { size: 'flexible', 'refresh-expired': 'auto' } : {}),
    })
  } catch {
    failed.value = true
  }
}

function unmount() {
  token.value = null
  const c = config.value
  if (widgetId === undefined || !c) return
  try {
    if (c.provider === 'turnstile') window.turnstile?.remove?.(widgetId)
  } catch {}
  widgetId = undefined
}

/** Clears the used token and shows a fresh challenge. */
function reset() {
  token.value = null
  const c = config.value
  if (widgetId === undefined || !c) return
  try {
    api(c.provider)?.reset(widgetId)
  } catch {
    mount()
  }
}
defineExpose({ reset })

onMounted(mount)
watch(() => [config.value?.provider, config.value?.siteKey, colorMode.value], () => mount())
onBeforeUnmount(unmount)
</script>

<template>
  <div v-if="config" class="space-y-1">
    <div ref="el" class="min-h-[65px]" />
    <p v-if="failed" class="text-xs text-error">The “I’m not a robot” check couldn't load. Check your connection or disable blockers for this site, then reload.</p>
  </div>
</template>
