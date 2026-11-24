import type { H3Event } from 'h3'
import { and, asc, eq, inArray, notInArray } from 'drizzle-orm'
import { db, schema } from 'hub:db'

/**
 * Task followers: the people who hear about a task's comments, status changes and reassignment. The creator, the
 * assignee and anyone who comments follow automatically; anyone in the team can follow or unfollow.
 */

/** Followers in the order they started following. Only people still in the team are listed. */
export async function taskFollowers(taskId: number): Promise<TaskFollowerDTO[]> {
  const rows = await db
    .select({ id: schema.users.id, name: schema.users.name })
    .from(schema.taskWatchers)
    .innerJoin(schema.users, eq(schema.taskWatchers.userId, schema.users.id))
    .where(and(eq(schema.taskWatchers.taskId, taskId), eq(schema.users.isGuest, false), inArray(schema.users.role, [...INTERNAL_ROLES])))
    .orderBy(asc(schema.taskWatchers.createdAt))
  return rows.map((r) => ({ id: r.id, name: displayName(r) }))
}

async function publishFollowers(event: H3Event, taskId: number) {
  publishTask(event, { type: 'task.followers', body: { taskId, followers: await taskFollowers(taskId) } })
}

/** Adds followers (already-following people are ignored) and tells open task pages. */
export async function followTask(event: H3Event, taskId: number, userIds: (string | null | undefined)[]) {
  const ids = [...new Set(userIds.filter((id): id is string => !!id))]
  if (!ids.length) return
  const added = await db
    .insert(schema.taskWatchers)
    .values(ids.map((userId) => ({ taskId, userId })))
    .onConflictDoNothing()
    .returning({ userId: schema.taskWatchers.userId })
  if (added.length) await publishFollowers(event, taskId)
}

export async function unfollowTask(event: H3Event, taskId: number, userId: string) {
  await db.delete(schema.taskWatchers).where(and(eq(schema.taskWatchers.taskId, taskId), eq(schema.taskWatchers.userId, userId)))
  await publishFollowers(event, taskId)
}

/**
 * Notifies the task's followers, except the person who made the change and anyone in `except` (people who already got
 * a more specific notification, such as a mention or "assigned you").
 */
export async function notifyTaskFollowers(
  event: H3Event,
  taskId: number,
  actorId: string,
  data: { type: string; message: string; link: string },
  except: (string | null | undefined)[] = [],
) {
  const skip = [actorId, ...except.filter((id): id is string => !!id)]
  const rows = await db
    .select({ userId: schema.taskWatchers.userId })
    .from(schema.taskWatchers)
    .innerJoin(schema.users, eq(schema.taskWatchers.userId, schema.users.id))
    .where(
      and(
        eq(schema.taskWatchers.taskId, taskId),
        notInArray(schema.taskWatchers.userId, skip),
        eq(schema.users.isGuest, false),
        inArray(schema.users.role, [...INTERNAL_ROLES]),
      ),
    )
  await notify(event, rows.map((r) => r.userId), data)
}
