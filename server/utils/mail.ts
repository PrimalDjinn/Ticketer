import type { H3Event } from 'h3'
import type { Component } from 'vue'
import { render } from '@vue-email/render'
import { z } from 'zod'
import Invitation from '../emails/Invitation.vue'
import Notification from '../emails/Notification.vue'
import PasswordReset from '../emails/PasswordReset.vue'
import TestEmail from '../emails/TestEmail.vue'

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

// ---------------------------------------------------------------------------------------------------------------------
// Templates (Vue Email components in server/emails/), rendered to HTML plus a plain-text version
// ---------------------------------------------------------------------------------------------------------------------

function appName() {
  return useRuntimeConfig().public.appName || 'Ticketer'
}

/** Plain-text rendering: links once, no images/preview text, headings as written, the HTML-only fallback skipped. */
const plainText = {
  wordwrap: 100,
  selectors: [
    { selector: 'img', format: 'skip' },
    { selector: '#__vue-email-preview', format: 'skip' },
    { selector: '.html-only', format: 'skip' },
    { selector: 'a', options: { linkBrackets: false, hideLinkHrefIfSameAsText: true } },
    { selector: 'h1', options: { uppercase: false } },
    { selector: 'hr', format: 'skip' },
  ],
}

async function renderMail<P extends Record<string, unknown>>(template: Component, props: P) {
  const [html, text] = await Promise.all([render(template, props), render(template, props, { plainText: true, htmlToTextOptions: plainText })])
  return { html, text }
}

export function testMail() {
  return renderMail(TestEmail, { appName: appName() })
}

export function passwordResetMail(link: string) {
  return renderMail(PasswordReset, { appName: appName(), link })
}

export function inviteMail(link: string, inviter: string | null, role: UserRole) {
  return renderMail(Invitation, { appName: appName(), link, inviter, rolePhrase: rolePhrase(role), days: INVITE_TTL_DAYS })
}

/** A copy of an in-app notification, with a link to the item and to the setting that turns these emails off. */
export function notificationMail(message: string, url: string, settingsUrl: string) {
  return renderMail(Notification, { appName: appName(), message, link: url, settingsLink: settingsUrl })
}
