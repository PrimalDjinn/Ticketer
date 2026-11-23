// Cloudflare builds alias `nodemailer` here: Workers send mail through the EMAIL binding instead of SMTP.
export function createTransport(): never {
  throw new Error('SMTP is not available on Cloudflare; configure the EMAIL send_email binding instead')
}
export default { createTransport }
