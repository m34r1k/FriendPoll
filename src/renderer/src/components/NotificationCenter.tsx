import { useEffect, useRef, useState, type ReactNode } from 'react'
import { rankForYou } from '../lib/forYou'
import { profileOf, usePeople, type People } from '../lib/people'
import { isFull } from '../lib/sessions'
import { formatAgo, formatSlot } from '../lib/time'
import type { AppNotification, JoinRequest, Poll, PollResponse } from '../types'
import { Avatar } from './Avatar'

interface Props {
  /** The viewer's notifications, newest first. */
  notifications: AppNotification[]
  polls: Poll[]
  /** Answers so far, for ranking "For you". */
  responses: PollResponse[]
  joinRequests: JoinRequest[]
  viewerId: string
  now: Date
  onOpen: (notification: AppNotification) => void
  onDecide: (requestId: string, allow: boolean) => void
  onMarkAllRead: () => void
  onClose: () => void
}

export function NotificationCenter({
  notifications,
  polls,
  responses,
  joinRequests,
  viewerId,
  now,
  onOpen,
  onDecide,
  onMarkAllRead,
  onClose
}: Props) {
  const [tab, setTab] = useState<'all' | 'unread' | 'foryou'>('all')
  const panelRef = useRef<HTMLDivElement>(null)
  const people = usePeople()

  useEffect(() => {
    const onPointerDown = (e: MouseEvent): void => {
      const target = e.target as HTMLElement
      // The bell toggles the panel itself, so a click on it isn't "outside".
      if (!panelRef.current?.contains(target) && !target.closest('[data-notification-bell]')) onClose()
    }
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  const unreadCount = notifications.filter((n) => !n.readAt).length
  const ranked = rankForYou({ notifications, polls, responses, joinRequests, viewerId, now, people })
  const reasons = new Map(ranked.map((r) => [r.notification.id, r.reason]))
  const shown =
    tab === 'unread'
      ? notifications.filter((n) => !n.readAt)
      : tab === 'foryou'
        ? ranked.map((r) => r.notification)
        : notifications

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Notifications"
      className="fixed right-4 top-16 z-30 flex max-h-[calc(100vh-5rem)] w-96 flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl"
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="font-semibold">Notifications</h2>
        <button
          type="button"
          disabled={unreadCount === 0}
          onClick={onMarkAllRead}
          className="ml-auto text-xs font-semibold text-accent disabled:text-muted disabled:opacity-60"
        >
          Mark all as read
        </button>
      </header>

      <div className="flex items-center gap-1 border-b border-line px-3 py-2">
        <TabButton active={tab === 'all'} onClick={() => setTab('all')}>
          All
        </TabButton>
        <TabButton active={tab === 'unread'} onClick={() => setTab('unread')}>
          Unread{unreadCount > 0 ? ` (${unreadCount})` : ''}
        </TabButton>
        <span className="ml-auto">
          <TabButton
            active={tab === 'foryou'}
            onClick={() => setTab('foryou')}
            title="What most likely needs you, worked out from your own answers. AI reasons come in Phase 3b."
          >
            ✨ For you
          </TabButton>
        </span>
      </div>

      <ul className="flex-1 divide-y divide-line overflow-y-auto">
        {shown.length === 0 && (
          <li className="px-4 py-10 text-center text-sm text-muted">
            {tab === 'unread'
              ? "You're all caught up."
              : tab === 'foryou'
                ? 'Nothing needs you right now.'
                : 'No notifications yet.'}
          </li>
        )}
        {shown.map((n) => {
          const poll = polls.find((p) => p.id === n.pollId)
          const request = n.joinRequestId ? joinRequests.find((r) => r.id === n.joinRequestId) : undefined
          return (
            <li key={n.id} className={n.readAt ? '' : 'bg-accent-soft/40'}>
              <button
                type="button"
                onClick={() => onOpen(n)}
                className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sunken"
              >
                {n.kind === 'session_on' ? (
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-go text-sm font-bold text-on-bright">
                    ✓
                  </span>
                ) : (
                  <Avatar profile={profileOf(people, n.actorId)} size="sm" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm leading-snug">{describe(n, poll, viewerId, now, people)}</span>
                  {tab === 'foryou' && reasons.get(n.id) && (
                    <span className="mt-1 block text-xs font-semibold text-accent">{reasons.get(n.id)}</span>
                  )}
                  <span className="mt-0.5 block text-xs text-muted">{formatAgo(n.createdAt, now)}</span>
                </span>
                {!n.readAt && <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" />}
              </button>

              {request && poll && (
                <div className="flex items-center gap-2 px-4 pb-3 pl-15">
                  {request.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        disabled={isFull(poll)}
                        onClick={() => onDecide(request.id, true)}
                        className="rounded-lg bg-go px-3 py-1 text-xs font-semibold text-on-bright disabled:opacity-40"
                      >
                        Allow
                      </button>
                      <button
                        type="button"
                        onClick={() => onDecide(request.id, false)}
                        className="rounded-lg border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted hover:bg-sunken"
                      >
                        Deny
                      </button>
                      {isFull(poll) && <span className="text-xs text-muted">Poll is full</span>}
                    </>
                  ) : (
                    <span className="text-xs font-medium text-muted">
                      {request.status === 'approved' ? 'Allowed' : 'Denied'}
                    </span>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function describe(
  n: AppNotification,
  poll: Poll | undefined,
  viewerId: string,
  now: Date,
  people: People
): ReactNode {
  const person = (id: string | undefined): ReactNode => (
    <b className="font-semibold">{id === viewerId ? 'You' : id ? profileOf(people, id).displayName : 'Someone'}</b>
  )
  const title = <b className="font-semibold">{poll?.title ?? 'a poll'}</b>
  const time = poll?.times.find((t) => t.id === n.timeId)
  const slot = time ? formatSlot(time.startsAt, now) : 'a time'

  switch (n.kind) {
    case 'invited':
      return (
        <>
          {person(n.actorId)} invited you to {title}
          {n.subjectId && <> · suggested by {person(n.subjectId)}</>}
        </>
      )
    case 'join_request':
      return (
        <>
          {person(n.actorId)} wants to add {person(n.subjectId)} to {title}
        </>
      )
    case 'join_approved':
      return (
        <>
          {person(n.actorId)} added {person(n.subjectId)} to {title}
        </>
      )
    case 'join_denied':
      return (
        <>
          {person(n.actorId)} didn't add {person(n.subjectId)} to {title}
        </>
      )
    case 'answered':
      return (
        <>
          {person(n.actorId)} said {n.answer === 'maybe' ? 'Maybe' : 'Yes'} to {slot} in {title}
        </>
      )
    case 'session_on':
      return (
        <>
          {slot} is on for {title}
        </>
      )
  }
}

interface TabButtonProps {
  active: boolean
  onClick: () => void
  title?: string
  children: ReactNode
}

function TabButton({ active, onClick, title, children }: TabButtonProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      title={title}
      onClick={onClick}
      className={`rounded-md px-2.5 py-1 text-xs font-semibold ${active ? 'bg-sunken text-ink' : 'text-muted hover:text-ink'}`}
    >
      {children}
    </button>
  )
}
