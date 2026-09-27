import type { Session } from '@supabase/supabase-js'
import { useState } from 'react'
import { FriendsPanel } from './components/FriendsPanel'
import { FriendsScreen } from './components/FriendsScreen'
import { Home } from './components/Home'
import { NewPollDialog } from './components/NewPollDialog'
import { NotificationCenter } from './components/NotificationCenter'
import { PollScreen } from './components/PollScreen'
import { TopBar } from './components/TopBar'
import { explainError } from './lib/errors'
import { PeopleProvider, profileOf } from './lib/people'
import { isInPoll } from './lib/sessions'
import { supabase } from './lib/supabase'
import { useNow } from './lib/useNow'
import { usePollData } from './lib/usePollData'
import type { Answer, AppNotification, PollDraft } from './types'

type Screen = { name: 'home' } | { name: 'poll'; pollId: string } | { name: 'friends' }
type RpcResult = PromiseLike<{ error: { message: string; code?: string } | null }>

interface Props {
  session: Session
  onOpenDemo: () => void
}

/** The signed-in app, on real data. Same screens as the demo. */
export function RealApp({ session, onOpenDemo }: Props) {
  const me = session.user.id
  const now = useNow()
  const { data, error: loadError, refresh, patch } = usePollData(me)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  /** Friends to pre-tick in the New poll dialog; null while it's closed. */
  const [newPollFor, setNewPollFor] = useState<string[] | null>(null)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const signOut = (): void => void supabase.auth.signOut()

  if (!data) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-bg px-6 text-center text-ink">
        {loadError ? (
          <>
            <p role="alert" className="max-w-md rounded-lg bg-accent-soft px-4 py-3 text-sm text-accent">
              {loadError}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                Try again
              </button>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold hover:bg-sunken"
              >
                Sign out
              </button>
            </div>
          </>
        ) : (
          <p className="text-sm text-muted">Loading your polls…</p>
        )}
      </div>
    )
  }

  const people = { profiles: data.profiles, friends: data.friends }
  const meProfile = profileOf(people, me)
  const openPoll =
    screen.name === 'poll' ? data.polls.find((p) => p.id === screen.pollId && isInPoll(p, me)) : undefined
  const unreadCount = data.notifications.filter((n) => !n.readAt).length
  const unreadByPoll: Record<string, number> = {}
  for (const n of data.notifications) {
    if (!n.readAt) unreadByPoll[n.pollId] = (unreadByPoll[n.pollId] ?? 0) + 1
  }

  /** Runs a database function; shows its error, and reloads either way. */
  async function call(action: () => RpcResult): Promise<void> {
    const { error } = await action()
    setActionError(error ? explainError(error) : null)
    await refresh()
  }

  function markRead(filter: { pollId?: string }): void {
    const at = new Date()
    const matches = (n: AppNotification): boolean => !n.readAt && (!filter.pollId || n.pollId === filter.pollId)
    if (!data?.notifications.some(matches)) return
    patch((d) => ({ ...d, notifications: d.notifications.map((n) => (matches(n) ? { ...n, readAt: at } : n)) }))

    let query = supabase.from('notifications').update({ read_at: at.toISOString() }).eq('user_id', me).is('read_at', null)
    if (filter.pollId) query = query.eq('poll_id', filter.pollId)
    void query.then(({ error }) => {
      if (error) setActionError(explainError(error))
    })
  }

  /** Opening a poll counts as having seen everything about it. */
  function openPollScreen(pollId: string): void {
    setScreen({ name: 'poll', pollId })
    markRead({ pollId })
  }

  function answer(timeId: string, value: Answer | null): void {
    // Show the answer immediately; the reload afterwards corrects it if the
    // server refused.
    patch((d) => {
      const others = d.responses.filter((r) => !(r.timeId === timeId && r.userId === me))
      return { ...d, responses: value ? [...others, { timeId, userId: me, answer: value }] : others }
    })
    void call(() => supabase.rpc('set_answer', { p_time_id: timeId, p_answer: value }))
  }

  function decide(requestId: string, allow: boolean): void {
    void call(() => supabase.rpc('decide_join_request', { p_request_id: requestId, p_allow: allow }))
  }

  async function createPoll(draft: PollDraft): Promise<void> {
    setCreating(true)
    setCreateError(null)
    const { data: pollId, error } = await supabase.rpc('create_poll', {
      p_title: draft.title,
      p_starts: draft.startTimes.map((t) => t.toISOString()),
      p_length_minutes: draft.durationMinutes,
      p_invitee_ids: draft.inviteeIds,
      p_min_people: draft.minPeople
    })
    setCreating(false)
    if (error) {
      setCreateError(explainError(error))
      return
    }
    setNewPollFor(null)
    await refresh()
    setScreen({ name: 'poll', pollId: pollId as string })
  }

  function openNewPoll(friendIds: string[]): void {
    setCreateError(null)
    setNewPollFor(friendIds)
  }

  const headerButton = 'text-sm font-medium text-muted hover:text-ink'

  return (
    <PeopleProvider value={people}>
      <div className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
        <TopBar
          viewerId={me}
          unreadCount={unreadCount}
          notificationsOpen={notificationsOpen}
          onToggleNotifications={() => setNotificationsOpen((open) => !open)}
          onHome={() => setScreen({ name: 'home' })}
          onNewPoll={() => openNewPoll([])}
          leading={
            <>
              <button type="button" onClick={onOpenDemo} className={headerButton}>
                Demo
              </button>
              <button type="button" onClick={() => setScreen({ name: 'friends' })} className={headerButton}>
                Friends
              </button>
            </>
          }
          trailing={
            <>
              <div className="leading-tight">
                <div className="text-sm font-semibold">{meProfile.displayName}</div>
                <div className="text-xs text-muted">@{meProfile.username}</div>
              </div>
              <button
                type="button"
                onClick={signOut}
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-semibold hover:bg-sunken"
              >
                Sign out
              </button>
            </>
          }
        />

        {(actionError ?? loadError) && (
          <div role="alert" className="flex items-center gap-3 border-b border-accent/20 bg-accent-soft px-5 py-2 text-sm text-accent">
            <span className="flex-1">{actionError ?? loadError}</span>
            {actionError && (
              <button type="button" onClick={() => setActionError(null)} className="font-semibold">
                Dismiss
              </button>
            )}
          </div>
        )}
        {data.friends.length === 0 && screen.name === 'home' && (
          <div className="flex items-center gap-2 border-b border-line bg-sunken px-5 py-2 text-sm">
            You haven't added any friends yet - you can only invite friends to polls.
            <button
              type="button"
              onClick={() => setScreen({ name: 'friends' })}
              className="font-semibold text-accent hover:underline"
            >
              Add friends
            </button>
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          {screen.name === 'friends' ? (
            <main className="min-w-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-2xl px-6 py-6">
                <button type="button" onClick={() => setScreen({ name: 'home' })} className={headerButton}>
                  ← Home
                </button>
                <p className="mb-3 mt-3 text-sm text-muted">
                  Friends find you by <b className="font-semibold text-ink">@{meProfile.username}</b>.
                </p>
                <FriendsScreen onChanged={() => void refresh()} />
              </div>
            </main>
          ) : openPoll ? (
            <PollScreen
              key={openPoll.id}
              poll={openPoll}
              responses={data.responses}
              joinRequests={data.joinRequests.filter((r) => r.pollId === openPoll.id)}
              viewerId={me}
              now={now}
              onBack={() => setScreen({ name: 'home' })}
              onAnswer={answer}
              onInviteMore={(friendId) =>
                void call(() => supabase.rpc('invite_more', { p_poll_id: openPoll.id, p_user_id: friendId }))
              }
              onRequestJoin={(friendId) =>
                void call(() => supabase.rpc('request_join', { p_poll_id: openPoll.id, p_user_id: friendId }))
              }
              onDecide={decide}
            />
          ) : (
            <>
              <Home
                polls={data.polls}
                responses={data.responses}
                unreadByPoll={unreadByPoll}
                viewerId={me}
                now={now}
                onOpen={openPollScreen}
              />
              <FriendsPanel onInvite={(friendId) => openNewPoll([friendId])} onAdd={() => setScreen({ name: 'friends' })} />
            </>
          )}
        </div>

        {notificationsOpen && (
          <NotificationCenter
            notifications={data.notifications}
            polls={data.polls}
            joinRequests={data.joinRequests}
            viewerId={me}
            now={now}
            onOpen={(n) => {
              setNotificationsOpen(false)
              openPollScreen(n.pollId)
            }}
            onDecide={decide}
            onMarkAllRead={() => markRead({})}
            onClose={() => setNotificationsOpen(false)}
          />
        )}

        {newPollFor && (
          <NewPollDialog
            viewerId={me}
            preselected={newPollFor}
            now={now}
            submitting={creating}
            submitError={createError}
            onCancel={() => setNewPollFor(null)}
            onCreate={(draft) => void createPoll(draft)}
          />
        )}
      </div>
    </PeopleProvider>
  )
}
