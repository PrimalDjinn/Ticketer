/**
 * State for a form protected by the bot check: the token, whether the form may be sent, the headers to send, and
 * `spent()` to call after each attempt (tokens are single-use). Pass `when` to require it only sometimes (e.g. only
 * for visitors without a session).
 */
export function useCaptcha(when: () => boolean = () => true) {
  const { site } = useSite()
  const token = ref<string | null>(null)
  const widget = ref<{ reset(): void } | null>(null)
  const required = computed(() => !!site.value.captcha && when())
  const ready = computed(() => !required.value || !!token.value)
  return {
    token,
    widget,
    required,
    ready,
    headers: () => (required.value ? captchaHeaders(token.value) : {}),
    spent: () => widget.value?.reset(),
  }
}
