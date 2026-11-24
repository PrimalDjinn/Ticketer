/** Inline styles shared by the email templates (email clients ignore most stylesheets). */
export const heading = { margin: '0 0 16px', fontSize: '20px', lineHeight: '28px', fontWeight: '600', color: '#18181b' }
export const paragraph = { margin: '0 0 24px', fontSize: '15px', lineHeight: '24px', color: '#3f3f46' }
export const button = {
  display: 'inline-block',
  backgroundColor: '#4f46e5',
  color: '#ffffff',
  textDecoration: 'none',
  padding: '12px 20px',
  borderRadius: '8px',
  fontSize: '15px',
  fontWeight: '600',
}
export const small = { margin: '24px 0 0', fontSize: '13px', lineHeight: '20px', color: '#71717a' }
export const fallbackLink = { color: '#4f46e5', wordBreak: 'break-all' as const }
