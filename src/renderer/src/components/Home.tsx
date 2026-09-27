import type { ReactNode } from 'react'
import { profileOf, usePeople } from '../lib/people'
import { nameList, plural } from '../lib/names'
import { isArchived, notAnswered, summarizeTimes } from '../lib/sessions'
import { formatDuration, formatSlot } from '../lib/time'
import type { Poll, PollResponse } from '../types'
import { AvatarStack } from './Avatar'

interface Props {
  /** Only polls the viewer is in. */
  polls: Poll[]
  responses: PollResponse[]
  /** Unread notification count per poll, to flag polls with news. */
  unreadByPoll: Record<string, number>
  viewerId: string
  now: Date
  onOpen: (pollId: string) => void
}

export function Home({ polls, responses, unreadByPoll, viewerId, now, onOpen }: Props) {
  const people = usePeople()
  const updatesBadge = (pollId: string): ReactNode =>
    unreadByPoll[pollId] ? <Badge tone="accent">{unreadByPoll[pollId]} new</Badge> : undefined

  const firstStart = (poll: Poll): number => poll.times[0].startsAt.getTime()
  const open = polls.filter((p) => !isArchived(p, now)).sort((a, b) => firstStart(a) - firstStart(b))

  const invites = open
    .filter((p) => p.inviteeIds.includes(viewerId))
    .map((poll) => ({ poll, isNew: notAnswered(poll, responses).includes(viewerId) }))
    .sort((a, b) => Number(b.isNew) - Number(a.isNew))
  const newCount = invites.filter((i) => i.isNew).length

  const upcoming = open
    .flatMap((poll) =>
      summarizeTimes(poll, responses)
        .filter((s) => s.isSession && s.going.includes(viewerId) && s.time.endsAt.getTime() > now.getTime())
        .map((summary) => ({ poll, summary }))
    )
    .sort((a, b) => a.summary.time.startsAt.getTime() - b.summary.time.startsAt.getTime())

  const mine = open.filter((p) => p.creatorId === viewerId)
  const past = polls
    .filter((p) => isArchived(p, now))
    .sort((a, b) => b.closesAt.getTime() - a.closesAt.getTime())

  return (
    <main className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-8">
        <Section title="Invites for you" note={newCount > 0 ? `${newCount} new` : undefined}>
          {invites.length === 0 ? (
            <Empty>No invites right now.</Empty>
          ) : (
            invites.map(({ poll, isNew }) => (
              <PollRow
                key={poll.id}
                poll={poll}
                responses={responses}
                now={now}
                onOpen={onOpen}
                subtitle={`from ${profileOf(people, poll.creatorId).displayName}`}
                badge={
                  isNew ? <Badge tone="accent">New</Badge> : (updatesBadge(poll.id) ?? <Badge tone="muted">Answered</Badge>)
                }
                action={isNew ? 'Respond' : 'View'}
              />
            ))
          )}
        </Section>

        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <Empty>Nothing planned yet. Answer an invite or start a poll.</Empty>
          ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3">
              {upcoming.map(({ poll, summary }) => (
                <button
                  key={summary.time.id}
                  type="button"
                  onClick={() => onOpen(poll.id)}
                  className="rounded-xl border border-go/30 bg-surface p-4 text-left shadow-sm hover:border-go/60"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-go">
                    {formatSlot(summary.time.startsAt, now)}
                  </div>
                  <div className="mt-1 truncate text-base font-semibold">{poll.title}</div>
                  <div className="mt-3 flex items-center gap-2">
                    <AvatarStack ids={summary.going} />
                    <span className="truncate text-sm text-muted">{nameList(summary.going, viewerId, people)}</span>
                  </div>
                  {summary.maybe.length > 0 && (
                    <div className="mt-1 text-xs text-maybe">+{summary.maybe.length} maybe</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="Your polls">
          {mine.length === 0 ? (
            <Empty>You haven't started any polls.</Empty>
          ) : (
            mine.map((poll) => {
              const answered = poll.inviteeIds.length - notAnswered(poll, responses).length
              return (
                <PollRow
                  key={poll.id}
                  poll={poll}
                  responses={responses}
                  now={now}
                  onOpen={onOpen}
                  subtitle={`${poll.inviteeIds.length} invited, ${answered} answered`}
                  badge={updatesBadge(poll.id)}
                  action="Open"
                />
              )
            })
          )}
        </Section>

        {past.length > 0 && (
          <Section title="Past">
            {past.map((poll) => {
              const sessions = summarizeTimes(poll, responses).filter((s) => s.isSession)
              return (
                <button
                  key={poll.id}
                  type="button"
                  onClick={() => onOpen(poll.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-sunken"
                >
                  <span className="shrink-0 font-medium">{poll.title}</span>
                  <span className="min-w-0 flex-1 truncate text-muted">
                    {sessions.length === 0
                      ? 'no times happened'
                      : `${plural(sessions.length, 'session')}: ${sessions
                          .map((s) => `${formatSlot(s.time.startsAt, now)} (${s.going.length})`)
                          .join(', ')}`}
                  </span>
                  <span className="shrink-0 text-xs text-muted">Closed</span>
                </button>
              )
            })}
          </Section>
        )}
      </div>
    </main>
  )
}

interface PollRowProps {
  poll: Poll
  responses: PollResponse[]
  now: Date
  subtitle: string
  badge?: ReactNode
  action: string
  onOpen: (pollId: string) => void
}

function PollRow({ poll, responses, now, subtitle, badge, action, onOpen }: PollRowProps) {
  const summaries = summarizeTimes(poll, responses)
  const on = summaries.filter((s) => s.isSession).length
  return (
    <button
      type="button"
      onClick={() => onOpen(poll.id)}
      className="flex w-full items-center gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-left shadow-sm hover:border-accent/40"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-semibold">{poll.title}</span>
          {badge}
        </div>
        <div className="mt-0.5 truncate text-sm text-muted">
          {subtitle} · {plural(poll.times.length, 'time')} · {on} on · closes in{' '}
          {formatDuration(poll.closesAt.getTime() - now.getTime())}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {summaries.map((s) => (
            <span
              key={s.time.id}
              className={`rounded-md px-2 py-0.5 text-xs font-medium ${s.isSession ? 'bg-go-soft text-go' : 'bg-sunken text-muted'}`}
            >
              {formatSlot(s.time.startsAt, now)}
            </span>
          ))}
        </div>
      </div>
      <span className="shrink-0 rounded-lg bg-sunken px-3 py-1.5 text-sm font-semibold">{action}</span>
    </button>
  )
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-lg font-bold tracking-tight">{title}</h2>
        {note && (
          <span className="rounded-full bg-accent px-2 py-0.5 text-xs font-semibold text-white">{note}</span>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line px-4 py-5 text-sm text-muted">{children}</p>
  )
}

function Badge({ tone, children }: { tone: 'accent' | 'muted'; children: ReactNode }) {
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone === 'accent' ? 'bg-accent text-white' : 'bg-sunken text-muted'}`}
    >
      {children}
    </span>
  )
}
