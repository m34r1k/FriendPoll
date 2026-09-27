import { buildPoll } from '../lib/sessions'
import type {
  Answer,
  AppNotification,
  ChatMessage,
  JoinRequest,
  Poll,
  PollResponse,
  Profile
} from '../types'

// Hardcoded stand-in data for the demo. Phase 1 onward replaces this with
// Supabase. Times are relative to when the app starts, so open polls stay
// open and the past one is always over.

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export const ME = 'u-avery'

export const allPeople: Profile[] = [
  { id: 'u-avery', username: 'avery', displayName: 'Avery', avatarColor: '#e0773c' },
  { id: 'u-dana', username: 'dana', displayName: 'Dana', avatarColor: '#3d8fd6' },
  { id: 'u-ellis', username: 'ellis', displayName: 'Ellis', avatarColor: '#8d62d9' },
  { id: 'u-casey', username: 'casey', displayName: 'Casey', avatarColor: '#d6477f' },
  { id: 'u-micah', username: 'micah', displayName: 'Micah', avatarColor: '#2fa88a' },
  { id: 'u-jules', username: 'jules', displayName: 'Jules', avatarColor: '#b8962e' }
]

export const profiles: Record<string, Profile> = Object.fromEntries(
  allPeople.map((p) => [p.id, p])
)

/** Everyone in the demo is friends with everyone else. */
export function friendsOf(userId: string): Profile[] {
  return allPeople.filter((p) => p.id !== userId)
}

const ago = (ms: number): Date => new Date(Date.now() - ms)

/** On the hour, roughly `hours` from now. */
function hoursFromNow(hours: number): Date {
  const date = new Date(Date.now() + hours * HOUR)
  date.setMinutes(0, 0, 0)
  return date
}

/** `hour`:00 on the day `days` from today (negative = in the past). */
function dayAt(days: number, hour: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date
}

export const initialPolls: Poll[] = [
  buildPoll(
    { id: 'p-mc', creatorId: 'u-ellis', title: 'MC tonight?', inviteeIds: [ME, 'u-dana', 'u-casey', 'u-jules'], minPeople: 2, createdAt: ago(50 * MINUTE) },
    [hoursFromNow(2), hoursFromNow(4), hoursFromNow(6)],
    120
  ),
  buildPoll(
    { id: 'p-study', creatorId: 'u-micah', title: 'Study session', inviteeIds: [ME, 'u-jules'], minPeople: 3, createdAt: ago(5 * HOUR) },
    [dayAt(1, 14), dayAt(1, 16)],
    120
  ),
  buildPoll(
    { id: 'p-val', creatorId: ME, title: 'Valorant 5-stack', inviteeIds: ['u-dana', 'u-casey', 'u-ellis', 'u-jules'], minPeople: 5, createdAt: ago(DAY) },
    [dayAt(2, 20), dayAt(2, 22)],
    180
  ),
  buildPoll(
    { id: 'p-among', creatorId: 'u-casey', title: 'Among Us?', inviteeIds: [ME, 'u-micah', 'u-jules', 'u-dana'], minPeople: 2, createdAt: ago(4 * DAY) },
    [dayAt(-3, 19), dayAt(-3, 21)],
    120
  )
]

function answers(timeId: string, byUser: Record<string, Answer>): PollResponse[] {
  return Object.entries(byUser).map(([userId, answer]) => ({ timeId, userId, answer }))
}

export const initialResponses: PollResponse[] = [
  // MC tonight (needs 2): Dana is free first, Casey second. Avery hasn't
  // answered yet, so it shows as a new invite.
  ...answers('p-mc-t1', { 'u-dana': 'yes', 'u-jules': 'maybe' }),
  ...answers('p-mc-t2', { 'u-casey': 'yes' }),
  // Study (needs 3): Micah + Jules + Avery, so tomorrow 2 PM is on.
  ...answers('p-study-t1', { 'u-jules': 'yes', [ME]: 'yes' }),
  ...answers('p-study-t2', { [ME]: 'maybe' }),
  // Valorant (needs 5): only 3 going at 8 PM so far. Jules hasn't answered.
  ...answers('p-val-t1', { 'u-dana': 'yes', 'u-casey': 'yes', 'u-ellis': 'maybe' }),
  ...answers('p-val-t2', { 'u-dana': 'yes' }),
  // Among Us (closed): both times happened.
  ...answers('p-among-t1', { [ME]: 'yes', 'u-micah': 'yes' }),
  ...answers('p-among-t2', { 'u-jules': 'yes', 'u-dana': 'maybe' })
]

let lastId = 0
function msg(pollId: string, authorId: string, createdAt: Date, content: string): ChatMessage {
  return { id: `m-${++lastId}`, pollId, authorId, content, createdAt }
}

export const initialMessages: ChatMessage[] = [
  msg('p-mc', 'u-ellis', ago(49 * MINUTE), 'new world is ready 👀'),
  msg('p-mc', 'u-dana', ago(30 * MINUTE), 'first time works for me'),
  msg('p-mc', 'u-casey', ago(12 * MINUTE), 'i can only do the second one, practice before that'),
  msg('p-study', 'u-micah', ago(5 * HOUR), 'library or call?'),
  msg('p-study', 'u-jules', ago(4 * HOUR), 'library pls'),
  msg('p-val', ME, ago(DAY), 'need 5 for ranked, who is in'),
  msg('p-val', 'u-dana', ago(20 * HOUR), 'in for 8'),
  msg('p-among', 'u-casey', ago(4 * DAY), 'among us this week?')
]

export const initialJoinRequests: JoinRequest[] = [
  // Dana wants Micah in Avery's Valorant poll - Avery has to decide.
  { id: 'jr-1', pollId: 'p-val', requestedById: 'u-dana', userId: 'u-micah', status: 'pending', createdAt: ago(20 * MINUTE) }
]

let lastNotificationId = 0
function note(fields: Omit<AppNotification, 'id' | 'readAt'>, read = false): AppNotification {
  return { ...fields, id: `n-${++lastNotificationId}`, readAt: read ? fields.createdAt : null }
}

export const initialNotifications: AppNotification[] = [
  // Avery
  note({ userId: ME, kind: 'join_request', pollId: 'p-val', actorId: 'u-dana', subjectId: 'u-micah', joinRequestId: 'jr-1', createdAt: ago(20 * MINUTE) }),
  note({ userId: ME, kind: 'invited', pollId: 'p-mc', actorId: 'u-ellis', createdAt: ago(50 * MINUTE) }),
  note({ userId: ME, kind: 'session_on', pollId: 'p-study', actorId: 'u-jules', timeId: 'p-study-t1', createdAt: ago(4 * HOUR) }),
  note({ userId: ME, kind: 'invited', pollId: 'p-study', actorId: 'u-micah', createdAt: ago(5 * HOUR) }, true),
  note({ userId: ME, kind: 'answered', pollId: 'p-val', actorId: 'u-dana', timeId: 'p-val-t1', answer: 'yes', createdAt: ago(20 * HOUR) }, true),
  note({ userId: ME, kind: 'answered', pollId: 'p-val', actorId: 'u-casey', timeId: 'p-val-t1', answer: 'yes', createdAt: ago(22 * HOUR) }, true),
  note({ userId: ME, kind: 'answered', pollId: 'p-val', actorId: 'u-ellis', timeId: 'p-val-t1', answer: 'maybe', createdAt: ago(23 * HOUR) }, true),
  note({ userId: ME, kind: 'invited', pollId: 'p-among', actorId: 'u-casey', createdAt: ago(4 * DAY) }, true),
  // Everyone else, so "view as" has something to show
  note({ userId: 'u-ellis', kind: 'answered', pollId: 'p-mc', actorId: 'u-casey', timeId: 'p-mc-t2', answer: 'yes', createdAt: ago(12 * MINUTE) }),
  note({ userId: 'u-ellis', kind: 'session_on', pollId: 'p-mc', actorId: 'u-dana', timeId: 'p-mc-t1', createdAt: ago(30 * MINUTE) }, true),
  note({ userId: 'u-dana', kind: 'invited', pollId: 'p-mc', actorId: 'u-ellis', createdAt: ago(50 * MINUTE) }, true),
  note({ userId: 'u-dana', kind: 'invited', pollId: 'p-val', actorId: ME, createdAt: ago(DAY) }, true),
  note({ userId: 'u-jules', kind: 'invited', pollId: 'p-mc', actorId: 'u-ellis', createdAt: ago(50 * MINUTE) }),
  note({ userId: 'u-jules', kind: 'invited', pollId: 'p-val', actorId: ME, createdAt: ago(DAY) })
]
