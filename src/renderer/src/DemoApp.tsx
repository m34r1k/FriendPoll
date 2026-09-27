import { useState } from 'react'
import { FriendsPanel } from './components/FriendsPanel'
import { Home } from './components/Home'
import { NewPollDialog } from './components/NewPollDialog'
import { NotificationCenter } from './components/NotificationCenter'
import { PollScreen } from './components/PollScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { TopBar } from './components/TopBar'
import {
  initialJoinRequests,
  initialMessages,
  initialNotifications,
  initialPolls,
  initialResponses,
  ME,
  allPeople,
  friendsOf,
  profiles
} from './fake/data'
import { PeopleProvider } from './lib/people'
import { buildPoll, isFull, isInPoll, summarizeTimes } from './lib/sessions'
import { unreadChat } from './lib/useChatSeen'
import { useNow } from './lib/useNow'
import type {
  Answer,
  AppNotification,
  ChatMessage,
  JoinRequest,
  Poll,
  PollDraft,
  PollResponse
} from './types'

type Screen = { name: 'home' } | { name: 'poll'; pollId: string } | { name: 'settings' }
type NewNotification = Omit<AppNotification, 'id' | 'createdAt' | 'readAt'>

// In the real app, database triggers create notifications. Here the actions
// below create them, so the demo behaves the same way.
function stamp(fields: NewNotification): AppNotification {
  return { ...fields, id: crypto.randomUUID(), createdAt: new Date(), readAt: null }
}

export function DemoApp({ onExit }: { onExit: () => void }) {
  const now = useNow()
  // Demo only: which friend the app is being viewed as.
  const [viewerId, setViewerId] = useState(ME)
  const [screen, setScreen] = useState<Screen>({ name: 'home' })
  /** Friends to pre-tick in the New poll dialog; null while it's closed. */
  const [newPollFor, setNewPollFor] = useState<string[] | null>(null)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [polls, setPolls] = useState<Poll[]>(initialPolls)
  const [responses, setResponses] = useState<PollResponse[]>(initialResponses)
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages)
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>(initialJoinRequests)
  const [notifications, setNotifications] = useState<AppNotification[]>(initialNotifications)
  /** When this viewer last had each poll's chat open (see lib/useChatSeen.ts). */
  const [chatSeen, setChatSeen] = useState<Record<string, number>>({})

  const myPolls = polls.filter((p) => isInPoll(p, viewerId))
  const openPoll = screen.name === 'poll' ? myPolls.find((p) => p.id === screen.pollId) : undefined
  const myNotifications = notifications
    .filter((n) => n.userId === viewerId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
  const unreadByPoll: Record<string, number> = {}
  for (const n of myNotifications) {
    if (!n.readAt) unreadByPoll[n.pollId] = (unreadByPoll[n.pollId] ?? 0) + 1
  }
  const unreadChatByPoll = unreadChat(
    messages.filter((m) => myPolls.some((p) => p.id === m.pollId)),
    chatSeen,
    viewerId
  )

  function notify(fresh: NewNotification[]): void {
    if (fresh.length > 0) setNotifications((prev) => [...fresh.map(stamp), ...prev])
  }

  function markRead(match: (n: AppNotification) => boolean): void {
    const at = new Date()
    setNotifications((prev) =>
      prev.map((n) => (n.userId === viewerId && !n.readAt && match(n) ? { ...n, readAt: at } : n))
    )
  }

  function switchViewer(id: string): void {
    setViewerId(id)
    // A different person has read a different set of chats.
    setChatSeen({})
    setScreen({ name: 'home' })
    setNewPollFor(null)
    setNotificationsOpen(false)
  }

  /** Opening a poll counts as having seen everything about it. */
  function openPollScreen(pollId: string): void {
    setScreen({ name: 'poll', pollId })
    markRead((n) => n.pollId === pollId)
    setChatSeen((prev) => ({ ...prev, [pollId]: Date.now() }))
  }

  /** `null` clears the viewer's answer for that time. */
  function answer(pollId: string, timeId: string, value: Answer | null): void {
    const poll = polls.find((p) => p.id === pollId)
    if (!poll) return
    const next = responses.filter((r) => !(r.timeId === timeId && r.userId === viewerId))
    if (value) next.push({ timeId, userId: viewerId, answer: value })
    const before = summarizeTimes(poll, responses).find((s) => s.time.id === timeId)
    const after = summarizeTimes(poll, next).find((s) => s.time.id === timeId)
    setResponses(next)

    const fresh: NewNotification[] = []
    if (value) {
      fresh.push({ userId: poll.creatorId, kind: 'answered', pollId, actorId: viewerId, timeId, answer: value })
    }
    if (after?.isSession && !before?.isSession) {
      for (const id of after.going) {
        if (id !== viewerId) fresh.push({ userId: id, kind: 'session_on', pollId, actorId: viewerId, timeId })
      }
    }
    // One "answered" per person per time: a changed or cleared answer replaces
    // the creator's unread one instead of piling up.
    setNotifications((prev) => [
      ...fresh.map(stamp),
      ...prev.filter(
        (n) => !(n.kind === 'answered' && !n.readAt && n.actorId === viewerId && n.timeId === timeId)
      )
    ])
  }

  function sendMessage(pollId: string, content: string): void {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), pollId, authorId: viewerId, content, createdAt: new Date() }
    ])
  }

  function createPoll(draft: PollDraft): void {
    const poll = buildPoll(
      {
        id: crypto.randomUUID(),
        creatorId: viewerId,
        title: draft.title,
        inviteeIds: draft.inviteeIds,
        minPeople: draft.minPeople,
        createdAt: new Date()
      },
      draft.startTimes,
      draft.durationMinutes
    )
    setPolls((prev) => [...prev, poll])
    notify(draft.inviteeIds.map((id) => ({ userId: id, kind: 'invited', pollId: poll.id, actorId: viewerId })))
    setNewPollFor(null)
    setScreen({ name: 'poll', pollId: poll.id })
  }

  /** Adds a friend to a poll and returns the invite notification to send. */
  function addInvitee(poll: Poll, friendId: string, suggestedById?: string): NewNotification[] {
    setPolls((prev) =>
      prev.map((p) =>
        p.id === poll.id && !p.inviteeIds.includes(friendId)
          ? { ...p, inviteeIds: [...p.inviteeIds, friendId] }
          : p
      )
    )
    return [{ userId: friendId, kind: 'invited', pollId: poll.id, actorId: poll.creatorId, subjectId: suggestedById }]
  }

  /** The creator invites another friend after sending. */
  function inviteMore(pollId: string, friendId: string): void {
    const poll = polls.find((p) => p.id === pollId)
    if (!poll || poll.creatorId !== viewerId || isInPoll(poll, friendId) || isFull(poll)) return
    notify(addInvitee(poll, friendId))
    // Anyone who had suggested this friend is covered now.
    setJoinRequests((prev) =>
      prev.map((r) =>
        r.pollId === pollId && r.userId === friendId && r.status === 'pending' ? { ...r, status: 'approved' } : r
      )
    )
  }

  /** An invitee asks the creator to let a friend join. */
  function requestJoin(pollId: string, friendId: string): void {
    const poll = polls.find((p) => p.id === pollId)
    if (!poll || isInPoll(poll, friendId)) return
    if (joinRequests.some((r) => r.pollId === pollId && r.userId === friendId && r.status === 'pending')) return
    const request: JoinRequest = {
      id: crypto.randomUUID(),
      pollId,
      requestedById: viewerId,
      userId: friendId,
      status: 'pending',
      createdAt: new Date()
    }
    setJoinRequests((prev) => [...prev, request])
    notify([
      { userId: poll.creatorId, kind: 'join_request', pollId, actorId: viewerId, subjectId: friendId, joinRequestId: request.id }
    ])
  }

  function decideJoin(requestId: string, allow: boolean): void {
    const request = joinRequests.find((r) => r.id === requestId)
    const poll = request && polls.find((p) => p.id === request.pollId)
    if (!request || !poll || request.status !== 'pending' || poll.creatorId !== viewerId) return
    const alreadyIn = isInPoll(poll, request.userId)
    const approved = allow && (alreadyIn || !isFull(poll))
    setJoinRequests((prev) =>
      prev.map((r) => (r.id === requestId ? { ...r, status: approved ? 'approved' : 'denied' } : r))
    )
    markRead((n) => n.joinRequestId === requestId)
    notify([
      {
        userId: request.requestedById,
        kind: approved ? 'join_approved' : 'join_denied',
        pollId: poll.id,
        actorId: viewerId,
        subjectId: request.userId
      },
      ...(approved && !alreadyIn ? addInvitee(poll, request.userId, request.requestedById) : [])
    ])
  }

  return (
    <PeopleProvider value={{ profiles, friends: friendsOf(viewerId) }}>
    <div className="flex h-screen flex-col overflow-hidden bg-bg text-ink">
      <TopBar
        onExitDemo={onExit}
        demoViewers={allPeople}
        viewerId={viewerId}
        unreadCount={myNotifications.filter((n) => !n.readAt).length}
        notificationsOpen={notificationsOpen}
        onToggleNotifications={() => setNotificationsOpen((open) => !open)}
        onSwitchViewer={switchViewer}
        onHome={() => setScreen({ name: 'home' })}
        onNewPoll={() => setNewPollFor([])}
        onOpenSettings={() => setScreen({ name: 'settings' })}
      />
      <div className="flex min-h-0 flex-1">
        {screen.name === 'settings' ? (
          <SettingsScreen onBack={() => setScreen({ name: 'home' })} />
        ) : openPoll ? (
          <PollScreen
            key={openPoll.id}
            poll={openPoll}
            responses={responses}
            messages={messages.filter((m) => m.pollId === openPoll.id)}
            joinRequests={joinRequests.filter((r) => r.pollId === openPoll.id)}
            viewerId={viewerId}
            now={now}
            onBack={() => setScreen({ name: 'home' })}
            onAnswer={(timeId, value) => answer(openPoll.id, timeId, value)}
            onSend={(content) => sendMessage(openPoll.id, content)}
            onInviteMore={(friendId) => inviteMore(openPoll.id, friendId)}
            onRequestJoin={(friendId) => requestJoin(openPoll.id, friendId)}
            onDecide={decideJoin}
          />
        ) : (
          <>
            <Home
              polls={myPolls}
              responses={responses}
              unreadByPoll={unreadByPoll}
              unreadChatByPoll={unreadChatByPoll}
              viewerId={viewerId}
              now={now}
              onOpen={openPollScreen}
            />
            <FriendsPanel onInvite={(friendId) => setNewPollFor([friendId])} />
          </>
        )}
      </div>

      {notificationsOpen && (
        <NotificationCenter
          notifications={myNotifications}
          polls={polls}
          responses={responses}
          joinRequests={joinRequests}
          viewerId={viewerId}
          now={now}
          onOpen={(n) => {
            setNotificationsOpen(false)
            openPollScreen(n.pollId)
          }}
          onDecide={decideJoin}
          onMarkAllRead={() => markRead(() => true)}
          onClose={() => setNotificationsOpen(false)}
        />
      )}

      {newPollFor && (
        <NewPollDialog
          viewerId={viewerId}
          preselected={newPollFor}
          now={now}
          onCancel={() => setNewPollFor(null)}
          onCreate={createPoll}
        />
      )}
    </div>
    </PeopleProvider>
  )
}
