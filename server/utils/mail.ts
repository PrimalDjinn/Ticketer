import type { H3Event } from 'h3'
import { z } from 'zod'

const log = useLogger('mail')

/** Cloudflare `send_email` binding (subset used here). */
interface SendEmailBinding {
  send(message: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>
}

interface Mail {
  to: string
  subject: string
  text: string
  html: string
}

/** Mail settings saved from Settings → Email. The SMTP password is stored encrypted. */
export const mailSettingsShape = z.object({
  from: z.string().trim().max(200).default(''),
  host: z.string().trim().max(253).default(''),
  port: z.number().int().min(1).max(65535).default(587),
  /** tls: implicit TLS (usually 465); starttls: upgrade after connecting (usually 587); none: plain (local relays). */
  security: z.enum(['tls', 'starttls', 'none']).default('starttls'),
  user: z.string().max(320).default(''),
  password: z.string().max(2000).nullable().default(null),
})
export type MailSettings = z.output<typeof mailSettingsShape>

export type MailTransport = 'cloudflare' | 'smtp' | 'none'

export interface MailConfig {
  from: string
  fromSource: SettingSource
  transport: MailTransport
  /** SMTP connection string (Node only), from NUXT_MAIL_SMTP_URL or built from the saved settings. */
  smtpUrl: string | null
  smtpSource: SettingSource
  settings: MailSettings
}

/** Running as a Worker with the Cloudflare `EMAIL` send_email binding available. */
function emailBinding(event: H3Event) {
  return (event.context.cloudflare?.env as { EMAIL?: SendEmailBinding } | undefined)?.EMAIL
}

export function onCloudflare(event: H3Event) {
  return !!event.context.cloudflare
}

/**
 * The effective mail setup. Environment variables win (NUXT_MAIL_FROM, NUXT_MAIL_SMTP_URL); anything they leave unset
 * comes from Settings → Email.
 */
export async function mailConfig(event: H3Event): Promise<MailConfig> {
  const env = useRuntimeConfig(event).mail
  const settings = (await getSetting('mail', mailSettingsShape)) ?? mailSettingsShape.parse({})

  const from = env.from || settings.from
  const fromSource: SettingSource = env.from ? 'env' : settings.from ? 'settings' : 'unset'

  let smtpUrl: string | null = null
  let smtpSource: SettingSource = 'unset'
  if (env.smtpUrl) {
    smtpUrl = env.smtpUrl
    smtpSource = 'env'
  } else if (settings.host) {
    const password = await decryptSecret(settings.password)
    const auth = settings.user ? `${encodeURIComponent(settings.user)}${password ? `:${encodeURIComponent(password)}` : ''}@` : ''
    const scheme = settings.security === 'tls' ? 'smtps' : 'smtp'
    const query = settings.security === 'none' ? '?ignoreTLS=true' : settings.security === 'starttls' ? '?requireTLS=true' : ''
    smtpUrl = `${scheme}://${auth}${settings.host}:${settings.port}${query}`
    smtpSource = 'settings'
  }

  const transport: MailTransport = onCloudflare(event) ? (emailBinding(event) ? 'cloudflare' : 'none') : smtpUrl ? 'smtp' : 'none'
  return { from, fromSource, transport, smtpUrl, smtpSource, settings }
}

/**
 * Sends transactional mail through the Cloudflare `EMAIL` send_email binding when deployed there, or SMTP on Node
 * (NUXT_MAIL_SMTP_URL or Settings → Email). With neither configured the message is logged, which keeps local setups
 * usable. Resolves to whether the message was handed to a transport; `throwErrors` surfaces transport errors (tests).
 */
export async function sendMail(event: H3Event, mail: Mail, options: { throwErrors?: boolean } = {}): Promise<boolean> {
  const config = await mailConfig(event)
  if (!config.from || config.transport === 'none') {
    log.info(config.from ? 'no mail transport configured; not sending' : 'no sender address configured; not sending', {
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
    })
    if (options.throwErrors) throw createError({ status: 400, message: config.from ? 'No mail transport is configured' : 'Set a sender address first' })
    return false
  }

  try {
    if (config.transport === 'cloudflare') {
      await emailBinding(event)!.send({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    } else {
      const { createTransport } = await import('nodemailer')
      await createTransport(config.smtpUrl!).sendMail({ from: config.from, ...mail })
    }
    return true
  } catch (error) {
    log.error('sending failed', { to: mail.to, subject: mail.subject, error: error instanceof Error ? error.message : String(error) })
    if (options.throwErrors) throw createError({ status: 502, message: `The mail server refused the message: ${error instanceof Error ? error.message : String(error)}` })
    throw error
  }
}

export function testMail() {
  const text = 'This is a test message from Ticketer. If you can read it, email is set up correctly.'
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td><h1 style="margin:0 0 16px;font-size:20px">Email works</h1>
<p style="margin:0;line-height:1.6;color:#3f3f46">${text}</p></td></tr></table></body></html>`
  return { text, html }
}

export function passwordResetMail(link: string) {
  const text = `Someone asked to reset your Ticketer password.\n\nOpen this link within an hour to choose a new one:\n${link}\n\nIf this wasn't you, you can ignore this email.`
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Reset your password</h1>
<p style="margin:0 0 24px;line-height:1.6;color:#3f3f46">Someone asked to reset your Ticketer password. The link below works for one hour.</p>
<a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Choose a new password</a>
<p style="margin:24px 0 0;font-size:13px;color:#71717a">If this wasn't you, you can ignore this email.</p>
</td></tr></table></body></html>`
  return { text, html }
}

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function inviteMail(link: string, inviter: string | null, role: UserRole) {
  const who = inviter ? `${inviter} invited you` : 'You have been invited'
  const text = `${who} to join Ticketer as ${rolePhrase(role)}.\n\nOpen this link within ${INVITE_TTL_DAYS} days to create your account:\n${link}\n\nIf you weren't expecting this, you can ignore this email.`
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Join Ticketer</h1>
<p style="margin:0 0 24px;line-height:1.6;color:#3f3f46">${escapeHtml(who)} to join as ${rolePhrase(role)}. The link below works for ${INVITE_TTL_DAYS} days.</p>
<a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Accept the invitation</a>
<p style="margin:24px 0 0;font-size:13px;color:#71717a">If you weren't expecting this, you can ignore this email.</p>
</td></tr></table></body></html>`
  return { text, html }
}
