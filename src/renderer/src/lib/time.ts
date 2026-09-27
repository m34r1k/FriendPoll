const DAY_MS = 24 * 60 * 60 * 1000

/** The computer's time zone, used unless settings override it. */
export const systemTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

/**
 * The zone every time on screen is shown in. Settings can point this somewhere
 * else (see lib/useSettings.tsx) - handy when you're travelling but your
 * friends aren't. Every function below reads it at the moment it's called.
 */
let displayTimeZone = systemTimeZone

export function isTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/** `null` goes back to the computer's zone. An unknown zone is ignored. */
export function setDisplayTimeZone(zone: string | null): void {
  displayTimeZone = zone && isTimeZone(zone) ? zone : systemTimeZone
}

export function getDisplayTimeZone(): string {
  return displayTimeZone
}

/** "2026-09-15" - also the id of a day, for comparing two dates. */
function dayKey(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

/** "Today", "Tomorrow", "Yesterday", a weekday within a week, else "Sep 3". */
export function formatDay(date: Date, now: Date, timeZone = displayTimeZone): string {
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
export function formatTime(date: Date, timeZone = displayTimeZone): string {
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(
    date
  )
}

/** "6 PM" - minutes are dropped when on the hour. */
function formatHour(date: Date, timeZone: string): string {
  return formatTime(date, timeZone).replace(':00', '')
}

/** "Today at 6:05 PM" */
export function formatMessageTime(date: Date, now: Date, timeZone = displayTimeZone): string {
  return `${formatDay(date, now, timeZone)} at ${formatTime(date, timeZone)}`
}

/** "Today 6 PM" */
export function formatSlot(date: Date, now: Date, timeZone = displayTimeZone): string {
  return `${formatDay(date, now, timeZone)} ${formatHour(date, timeZone)}`
}

/** "Today 9 PM – 11 PM" */
export function formatTimeRange(start: Date, end: Date, now: Date, timeZone = displayTimeZone): string {
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

/** "2026-09-15" for <input type="date">, by the clock we're showing. */
export function toDateInputValue(date: Date, timeZone = displayTimeZone): string {
  return dayKey(date, timeZone)
}

/** How far ahead of UTC `zone` was at that moment, in ms. */
function zoneOffsetMs(at: Date, zone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).formatToParts(at)
  const value = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? 0)
  // Midnight comes back as hour 24 in some locales.
  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    value('hour') % 24,
    value('minute'),
    value('second')
  )
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000
}

/**
 * The moment when the clock in `timeZone` reads that date and time - what the
 * date and time boxes in the New poll form mean. Guessed twice because the
 * offset itself depends on the answer (the clocks move twice a year).
 */
export function fromZonedParts(dateText: string, timeText: string, timeZone = displayTimeZone): Date {
  const asIfUtc = Date.parse(`${dateText}T${timeText.length === 5 ? `${timeText}:00` : timeText}Z`)
  if (Number.isNaN(asIfUtc)) return new Date(NaN)
  const first = asIfUtc - zoneOffsetMs(new Date(asIfUtc), timeZone)
  const second = asIfUtc - zoneOffsetMs(new Date(first), timeZone)
  // On the spring morning the clocks skip an hour, the time asked for never
  // happens. The second guess then lands before the jump, on a different time
  // than the one typed, so we keep the first one: an hour later, as the rest
  // of that day shifted.
  const settled = asIfUtc - zoneOffsetMs(new Date(second), timeZone) === second
  return new Date(settled ? second : first)
}

/** `hour`:00, `daysAhead` days from today, by the clock we're showing. */
export function zonedDayAt(daysAhead: number, hour: number, timeZone = displayTimeZone): Date {
  const midnight = new Date(Date.parse(`${dayKey(new Date(), timeZone)}T00:00:00Z`) + daysAhead * DAY_MS)
  return fromZonedParts(
    midnight.toISOString().slice(0, 10),
    `${String(hour).padStart(2, '0')}:00`,
    timeZone
  )
}

/** Day of the week where 0 is Sunday, by the clock we're showing. */
export function zonedWeekday(date: Date, timeZone = displayTimeZone): number {
  return new Date(`${dayKey(date, timeZone)}T00:00:00Z`).getUTCDay()
}
