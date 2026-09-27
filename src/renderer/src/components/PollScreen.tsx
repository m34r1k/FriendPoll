import { nameList, plural } from '../lib/names'
import { profileOf, usePeople } from '../lib/people'
import { isArchived, notAnswered, summarizeTimes, type TimeSummary } from '../lib/sessions'
import { formatDuration, formatTimeRange, systemTimeZone } from '../lib/time'
import type { Answer, ChatMessage, JoinRequest, Poll, PollResponse } from '../types'
import { AvatarStack } from './Avatar'
import { ChatPanel } from './ChatPanel'
import { PeopleCard } from './PeopleCard'

interface Props {
  poll: Poll
  responses: PollResponse[]
  /** This poll's join requests. */
  joinRequests: JoinRequest[]
  viewerId: string
  now: Date
  onBack: () => void
  onAnswer: (timeId: string, answer: Answer | null) => void
  onInviteMore: (friendId: string) => void
  onRequestJoin: (friendId: string) => void
  onDecide: (requestId: string, allow: boolean) => void
  /** Poll chat. Leave onSend out to show that chat is coming later. */
  messages?: ChatMessage[] | null
  onSend?: (content: string) => void
  chatHasMore?: boolean
  onLoadOlderMessages?: () => void
  onDeleteMessage?: (messageId: string) => void
  chatError?: string | null
}

export function PollScreen({
  poll,
  responses,
  joinRequests,
  viewerId,
  now,
  onBack,
  onAnswer,
  onInviteMore,
  onRequestJoin,
  onDecide,
  messages,
  onSend,
  chatHasMore,
  onLoadOlderMessages,
  onDeleteMessage,
  chatError
}: Props) {
  const people = usePeople()
  const archived = isArchived(poll, now)
  const isCreator = poll.creatorId === viewerId
  const summaries = summarizeTimes(poll, responses)
  const waiting = notAnswered(poll, responses)
  const lengthMs = poll.times[0].endsAt.getTime() - poll.times[0].startsAt.getTime()

  const hint = archived
    ? 'This poll is over, so answers are locked.'
    : isCreator
      ? "You're in for every time you listed. A time happens once enough friends say Yes."
      : "Tap Yes or Maybe on every time you're free. Not free? Just leave it blank."

  return (
    <div className="flex min-w-0 flex-1">
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-6">
          <button type="button" onClick={onBack} className="text-sm font-medium text-muted hover:text-ink">
            ← Home
          </button>

          <div className="mt-3 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-bold tracking-tight">{poll.title}</h1>
              <p className="mt-1 text-sm text-muted">
                {isCreator ? 'Your poll' : `From ${profileOf(people, poll.creatorId).displayName}`} ·{' '}
                {plural(poll.inviteeIds.length, 'friend')} invited · {formatDuration(lengthMs)} each ·
                needs {poll.minPeople} people
              </p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${archived ? 'bg-sunken text-muted' : 'bg-accent-soft text-accent'}`}
            >
              {archived ? 'Closed' : `Closes in ${formatDuration(poll.closesAt.getTime() - now.getTime())}`}
            </span>
          </div>

          <p className="mt-5 rounded-lg bg-sunken px-3 py-2 text-sm text-muted">{hint}</p>

          <ul className="mt-4 space-y-3">
            {summaries.map((summary) => (
              <TimeRow
                key={summary.time.id}
                summary={summary}
                viewerId={viewerId}
                canAnswer={!archived && !isCreator}
                now={now}
                onAnswer={onAnswer}
              />
            ))}
          </ul>

          {!archived && waiting.length > 0 && (
            <p className="mt-4 text-sm text-muted">Not answered yet: {nameList(waiting, viewerId, people)}</p>
          )}

          <PeopleCard
            poll={poll}
            joinRequests={joinRequests}
            viewerId={viewerId}
            archived={archived}
            onInviteMore={onInviteMore}
            onRequestJoin={onRequestJoin}
            onDecide={onDecide}
          />
          <p className="mt-6 text-xs text-muted">Times shown in {systemTimeZone}</p>
        </div>
      </main>

      {onSend ? (
        <ChatPanel
          messages={messages ?? null}
          peopleCount={poll.inviteeIds.length + 1}
          viewerId={viewerId}
          now={now}
          onSend={onSend}
          hasMore={chatHasMore}
          onLoadOlder={onLoadOlderMessages}
          onDelete={onDeleteMessage}
          error={chatError}
        />
      ) : (
        <aside className="flex w-80 shrink-0 flex-col items-center justify-center gap-1 border-l border-line bg-surface px-8 text-center">
          <h2 className="text-sm font-semibold">Chat</h2>
          <p className="text-sm text-muted">A chat for just the people in this poll is coming in the next update.</p>
        </aside>
      )}
    </div>
  )
}

interface TimeRowProps {
  summary: TimeSummary
  viewerId: string
  canAnswer: boolean
  now: Date
  onAnswer: (timeId: string, answer: Answer | null) => void
}

function TimeRow({ summary, viewerId, canAnswer, now, onAnswer }: TimeRowProps) {
  const people = usePeople()
  const mine: Answer | null = summary.maybe.includes(viewerId)
    ? 'maybe'
    : summary.going.includes(viewerId)
      ? 'yes'
      : null
  // Tapping your current answer again clears it.
  const toggle = (value: Answer): void => onAnswer(summary.time.id, mine === value ? null : value)

  return (
    <li className={`rounded-xl border bg-surface p-4 shadow-sm ${summary.isSession ? 'border-go/40' : 'border-line'}`}>
      <div className="flex items-center gap-3">
        <span className="font-semibold">{formatTimeRange(summary.time.startsAt, summary.time.endsAt, now)}</span>
        <span className="ml-auto shrink-0">
          {summary.isSession ? (
            <span className="rounded-full bg-go px-2.5 py-0.5 text-xs font-semibold text-white">On ✓</span>
          ) : (
            <span className="text-xs font-medium text-muted">needs {summary.needed} more</span>
          )}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex min-w-0 items-center gap-2">
          <AvatarStack ids={summary.going} />
          <span className="text-sm">{nameList(summary.going, viewerId, people)}</span>
        </span>
        {summary.maybe.length > 0 && (
          <span className="text-xs font-medium text-maybe">Maybe: {nameList(summary.maybe, viewerId, people)}</span>
        )}
      </div>

      {canAnswer && (
        <div className="mt-3 flex gap-2">
          <AnswerButton label="Yes" tone="go" active={mine === 'yes'} onClick={() => toggle('yes')} />
          <AnswerButton label="Maybe" tone="maybe" active={mine === 'maybe'} onClick={() => toggle('maybe')} />
        </div>
      )}
    </li>
  )
}

const TONES = {
  go: { active: 'border-go bg-go text-white', idle: 'border-line text-go hover:bg-go-soft' },
  maybe: { active: 'border-maybe bg-maybe text-white', idle: 'border-line text-maybe hover:bg-maybe-soft' }
}

interface AnswerButtonProps {
  label: string
  tone: keyof typeof TONES
  active: boolean
  onClick: () => void
}

function AnswerButton({ label, tone, active, onClick }: AnswerButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-4 py-1.5 text-sm font-semibold transition-colors ${active ? TONES[tone].active : TONES[tone].idle}`}
    >
      {active ? `✓ ${label}` : label}
    </button>
  )
}
