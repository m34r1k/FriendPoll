const DAY_MS = 24 * 60 * 60 * 1000

/** The computer's time zone. Phase 4 adds a per-user override in settings. */
export const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/** "Today", "Tomorrow", "Yesterday", a weekday within a week, else "Sep 3". */
export function formatDay(date: Date, now: Date, timeZone = systemTimeZone): string {
  const key = dayKey(date, timeZone)
  if (key === dayKey(now, timeZone)) return 'Today'
  if (key === dayKey(new Date(now.getTime() + DAY_MS), timeZone)) return 'Tomorrow'
  if (key === dayKey(new Date(now.getTime() - DAY_MS), timeZone)) return 'Yesterday'
  const withinWeek = Math.abs(date.getTime() - now.getTime()) < 6 * DAY_MS
  return new Intl.DateTimeFormat(
    'en-US',
    withinWeek ? { weekday: 'short', timeZone } : { month: 'short', day: 'numeric', timeZone }
  ).format(date)
}

/** "6:05 PM" */
export function formatTime(date: Date, timeZone = systemTimeZone): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    date
  )
}

/** "6 PM" - minutes are dropped when on the hour. */
function formatHour(date: Date, timeZone: string): string {
  return formatTime(date, timeZone).replace(':00', '')
}

/** "Today at 6:05 PM" */
export function formatMessageTime(date: Date, now: Date, timeZone = systemTimeZone): string {
  return `${formatDay(date, now, timeZone)} at ${formatTime(date, timeZone)}`
}

/** "Today 6 PM" */
export function formatSlot(date: Date, now: Date, timeZone = systemTimeZone): string {
  return `${formatDay(date, now, timeZone)} ${formatHour(date, timeZone)}`
}

/** "Today 9 PM – 11 PM" */
export function formatTimeRange(start: Date, end: Date, now: Date, timeZone = systemTimeZone): string {
  return `${formatSlot(start, now, timeZone)} – ${formatHour(end, timeZone)}`
}

/** "40 min", "5h", "3 days" */
export function formatDuration(ms: number): string {
  const minutes = Math.max(1, Math.round(ms / 60_000))
  if (minutes < 60) return `${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 48) return `${hours}h`
  return `${Math.round(hours / 24)} days`
}

/** "just now", "5 min ago", "3h ago", "2 days ago" */
export function formatAgo(date: Date, now: Date): string {
  const ms = now.getTime() - date.getTime()
  return ms < 60_000 ? 'just now' : `${formatDuration(ms)} ago`
}

/** "2026-09-15" in the computer's zone, for <input type="date">. */
export function toDateInputValue(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
