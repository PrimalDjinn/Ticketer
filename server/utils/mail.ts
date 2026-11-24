import type { H3Event } from 'h3'

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

/**
 * Sends transactional mail through the Cloudflare `EMAIL` send_email binding when deployed there, or SMTP
 * (NUXT_MAIL_SMTP_URL) on Node. With neither configured the message is logged, which keeps local setups usable.
 * Resolves to whether the message was handed to a transport.
 */
export async function sendMail(event: H3Event, mail: Mail): Promise<boolean> {
  const config = useRuntimeConfig(event).mail
  const env = event.context.cloudflare?.env as { EMAIL?: SendEmailBinding } | undefined

  if (!config.from) {
    log.info('NUXT_MAIL_FROM is not set; not sending', { to: mail.to, subject: mail.subject, text: mail.text })
    return false
  }

  if (env?.EMAIL) {
    await env.EMAIL.send({ from: config.from, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html })
    return true
  }

  if (config.smtpUrl) {
    const { createTransport } = await import('nodemailer')
    await createTransport(config.smtpUrl).sendMail({ from: config.from, ...mail })
    return true
  }

  log.info('no mail transport configured; not sending', { to: mail.to, subject: mail.subject, text: mail.text })
  return false
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

const ROLE_PHRASE: Record<UserRole, string> = { admin: 'an admin', member: 'a member', viewer: 'a viewer' }

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function inviteMail(link: string, inviter: string | null, role: UserRole) {
  const who = inviter ? `${inviter} invited you` : 'You have been invited'
  const text = `${who} to join Ticketer as ${ROLE_PHRASE[role]}.\n\nOpen this link within ${INVITE_TTL_DAYS} days to create your account:\n${link}\n\nIf you weren't expecting this, you can ignore this email.`
  const html = `<!doctype html><html><body style="margin:0;padding:32px;background:#f4f4f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;color:#18181b">
<table role="presentation" width="100%" style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:32px">
<tr><td>
<h1 style="margin:0 0 16px;font-size:20px">Join Ticketer</h1>
<p style="margin:0 0 24px;line-height:1.6;color:#3f3f46">${escapeHtml(who)} to join as ${ROLE_PHRASE[role]}. The link below works for ${INVITE_TTL_DAYS} days.</p>
<a href="${link}" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:600">Accept the invitation</a>
<p style="margin:24px 0 0;font-size:13px;color:#71717a">If you weren't expecting this, you can ignore this email.</p>
</td></tr></table></body></html>`
  return { text, html }
}
