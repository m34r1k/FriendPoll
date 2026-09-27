import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { usePeople } from '../lib/people'
import { nameList, plural } from '../lib/names'
import { MAX_PEOPLE_PER_POLL } from '../lib/sessions'
import { formatSlot, toDateInputValue } from '../lib/time'
import type { PollDraft } from '../types'
import { Avatar } from './Avatar'

const LENGTHS_MINUTES = [60, 120, 180]

interface Props {
  viewerId: string
  /** Friends already ticked when the dialog opens. */
  preselected: string[]
  now: Date
  onCancel: () => void
  onCreate: (draft: PollDraft) => void
  /** True while the poll is being saved. */
  submitting?: boolean
  /** Why saving failed, shown next to Send. */
  submitError?: string | null
}

/** `hour`:00 on the day `days` from today. */
function dayAt(days: number, hour: number): Date {
  const date = new Date()
  date.setDate(date.getDate() + days)
  date.setHours(hour, 0, 0, 0)
  return date
}

/** Next Saturday (never today) at `hour`:00. */
function nextSaturdayAt(hour: number): Date {
  const daysAhead = (6 - new Date().getDay() + 7) % 7 || 7
  return dayAt(daysAhead, hour)
}

export function NewPollDialog({
  viewerId,
  preselected,
  now,
  onCancel,
  onCreate,
  submitting = false,
  submitError = null
}: Props) {
  const people = usePeople()
  const friends = people.friends
  const [title, setTitle] = useState('')
  const [startTimes, setStartTimes] = useState<Date[]>([])
  const [date, setDate] = useState(() => toDateInputValue(new Date()))
  const [clock, setClock] = useState('20:00')
  const [lengthMinutes, setLengthMinutes] = useState(120)
  const [inviteeIds, setInviteeIds] = useState<string[]>(preselected)
  const [minPeople, setMinPeople] = useState(2)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onCancel])

  // People needed can't be more than everyone in the poll (invitees + you).
  const maxPeople = Math.max(2, inviteeIds.length + 1)
  const neededPeople = Math.min(minPeople, maxPeople)

  const quickPicks = [dayAt(0, 20), dayAt(0, 22), dayAt(1, 20), nextSaturdayAt(14)].filter(
    (d) => d.getTime() > now.getTime()
  )
  const typedTime = new Date(`${date}T${clock}`)
  const typedTimeValid = !Number.isNaN(typedTime.getTime())
  const typedTimePassed = typedTimeValid && typedTime.getTime() <= now.getTime()

  const problems = [
    !title.trim() && 'Add a title',
    startTimes.length === 0 && 'Add at least one time',
    inviteeIds.length === 0 && 'Invite at least one friend'
  ].filter((p): p is string => typeof p === 'string')

  function addTime(time: Date): void {
    if (time.getTime() <= Date.now()) return
    setStartTimes((prev) =>
      prev.some((t) => t.getTime() === time.getTime())
        ? prev
        : [...prev, time].sort((a, b) => a.getTime() - b.getTime())
    )
  }

  function toggleInvitee(friendId: string): void {
    setInviteeIds((prev) => {
      if (prev.includes(friendId)) return prev.filter((id) => id !== friendId)
      return prev.length + 1 < MAX_PEOPLE_PER_POLL ? [...prev, friendId] : prev
    })
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    if (problems.length > 0 || submitting) return
    onCreate({ title: title.trim(), startTimes, durationMinutes: lengthMinutes, inviteeIds, minPeople: neededPeople })
  }

  const stepButton =
    'flex size-9 items-center justify-center rounded-lg border border-line text-lg font-semibold hover:bg-sunken disabled:opacity-40'

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-ink/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-poll-heading"
        onSubmit={submit}
        className="flex max-h-full w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-surface shadow-2xl"
      >
        <header className="border-b border-line px-6 py-4">
          <h2 id="new-poll-heading" className="text-lg font-bold">
            New poll
          </h2>
          <p className="text-sm text-muted">Pick when you're free, then invite who you want to play with.</p>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="rounded-xl border border-dashed border-line p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">✨ Describe it</div>
            <input
              disabled
              aria-label="Describe the poll in a sentence"
              placeholder='e.g. "MC this weekend, evenings, with Daniel and Jun"'
              className="mt-1 w-full rounded-lg bg-sunken px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-muted">AI fills in the form for you - coming in Phase 3b.</p>
          </div>

          <Field label="Title">
            <input
              autoFocus
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Title"
              placeholder="MC tonight?"
              className="w-full rounded-lg border border-line px-3 py-2 outline-none focus:border-accent"
            />
          </Field>

          <Field label="When are you free?" hint={plural(startTimes.length, 'time')}>
            <div className="flex flex-wrap gap-2">
              {quickPicks.map((pick) => (
                <button
                  key={pick.getTime()}
                  type="button"
                  onClick={() => addTime(pick)}
                  className="rounded-full border border-line px-3 py-1 text-sm hover:border-accent hover:text-accent"
                >
                  + {formatSlot(pick, now)}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={date}
                min={toDateInputValue(now)}
                onChange={(e) => setDate(e.target.value)}
                aria-label="Date"
                className="rounded-lg border border-line px-2 py-1.5 text-sm"
              />
              <input
                type="time"
                value={clock}
                step={900}
                onChange={(e) => setClock(e.target.value)}
                aria-label="Start time"
                className="rounded-lg border border-line px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                disabled={!typedTimeValid || typedTimePassed}
                onClick={() => addTime(typedTime)}
                className="rounded-lg bg-sunken px-3 py-1.5 text-sm font-semibold hover:bg-line disabled:opacity-40"
              >
                Add
              </button>
              {typedTimePassed && <span className="text-xs text-accent">That time has already passed</span>}
            </div>
            {startTimes.length > 0 && (
              <ul className="mt-3 flex flex-wrap gap-2">
                {startTimes.map((time) => (
                  <li
                    key={time.getTime()}
                    className="flex items-center gap-1 rounded-full bg-accent-soft py-1 pl-3 pr-1 text-sm font-medium text-accent"
                  >
                    {formatSlot(time, now)}
                    <button
                      type="button"
                      aria-label={`Remove ${formatSlot(time, now)}`}
                      onClick={() => setStartTimes((prev) => prev.filter((t) => t.getTime() !== time.getTime()))}
                      className="flex size-5 items-center justify-center rounded-full hover:bg-accent/15"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Field>

          <Field label="How long?" hint="Same length for every time">
            <div className="inline-flex rounded-lg bg-sunken p-1">
              {LENGTHS_MINUTES.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={lengthMinutes === minutes}
                  onClick={() => setLengthMinutes(minutes)}
                  className={`rounded-md px-4 py-1 text-sm font-semibold ${lengthMinutes === minutes ? 'bg-surface shadow-sm' : 'text-muted'}`}
                >
                  {minutes / 60}h
                </button>
              ))}
            </div>
          </Field>

          <Field label="Invite friends" hint={`${inviteeIds.length} selected`}>
            {friends.length === 0 && (
              <p className="rounded-lg bg-sunken px-3 py-2 text-sm text-muted">
                You haven't added any friends yet. Add some on the Friends page first.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {friends.map((friend) => {
                const checked = inviteeIds.includes(friend.id)
                return (
                  <label
                    key={friend.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 ${checked ? 'border-accent bg-accent-soft' : 'border-line hover:bg-sunken'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleInvitee(friend.id)}
                      className="accent-accent"
                    />
                    <Avatar profile={friend} size="xs" />
                    <span className="text-sm font-medium">{friend.displayName}</span>
                  </label>
                )
              })}
            </div>
          </Field>

          <Field label="People needed" hint="Including you. A time happens once this many are in.">
            <div className="flex items-center gap-3">
              <button
                type="button"
                aria-label="Fewer people"
                disabled={neededPeople <= 2}
                onClick={() => setMinPeople(Math.max(2, neededPeople - 1))}
                className={stepButton}
              >
                −
              </button>
              <span className="w-8 text-center text-lg font-bold">{neededPeople}</span>
              <button
                type="button"
                aria-label="More people"
                disabled={neededPeople >= maxPeople}
                onClick={() => setMinPeople(Math.min(maxPeople, neededPeople + 1))}
                className={stepButton}
              >
                +
              </button>
              <span className="text-sm text-muted">of {inviteeIds.length + 1} people in this poll</span>
            </div>
          </Field>
        </div>

        <footer className="flex items-center gap-3 border-t border-line px-6 py-4">
          <span className={`min-w-0 flex-1 text-sm ${submitError ? 'text-accent' : 'truncate text-muted'}`}>
            {submitError ?? problems[0] ?? `Sends to ${nameList(inviteeIds, viewerId, people)}`}
          </span>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-muted hover:bg-sunken"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={problems.length > 0 || submitting}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-40"
          >
            {submitting ? 'Sending…' : 'Send invites'}
          </button>
        </footer>
      </form>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
