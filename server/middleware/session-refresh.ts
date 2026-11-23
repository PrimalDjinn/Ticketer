import { eq } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * Keeps the session's copy of the user (role, name, guest flag) in step with the database on page loads and session
 * reads, so a promotion or demotion applies without signing out. API routes re-check the role themselves.
 */
export default defineEventHandler(async (event) => {
  if (event.method !== 'GET') return
  const path = event.path
  const isPage = !path.startsWith('/api/') && !path.startsWith('/_') && !path.startsWith('/files/') && !/\.\w+$/.test(path.split('?')[0]!)
  if (!isPage && !path.startsWith('/api/_auth/session')) return

  const session = await getUserSession(event)
  if (!session.user) return
  const row = await db.query.users.findFirst({ where: eq(schema.users.id, session.user.id) })
  if (!row) {
    await clearUserSession(event)
    return
  }
  const fresh = toPublicUser(row)
  if (fresh.role !== session.user.role || fresh.name !== session.user.name || fresh.isGuest !== session.user.isGuest) {
    await replaceUserSession(event, { user: fresh, loggedInAt: session.loggedInAt })
  }
})
