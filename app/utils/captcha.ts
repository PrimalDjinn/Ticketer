/** Header carrying a bot-protection token, or nothing when there is none. */
export function captchaHeaders(token: string | null | undefined): Record<string, string> {
  return token ? { [CAPTCHA_HEADER]: token } : {}
}
