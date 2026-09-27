import { useState } from 'react'
import { profileOf, usePeople } from '../lib/people'
import { isFull, isInPoll, MAX_PEOPLE_PER_POLL } from '../lib/sessions'
import type { JoinRequest, Poll } from '../types'
import { Avatar } from './Avatar'

interface Props {
  poll: Poll
  /** This poll's join requests. */
  joinRequests: JoinRequest[]
  viewerId: string
  archived: boolean
  onInviteMore: (friendId: string) => void
  onRequestJoin: (friendId: string) => void
  onDecide: (requestId: string, allow: boolean) => void
}

/**
 * Who's in the poll. The creator can invite more friends directly; anyone else
 * can suggest a friend, which sends the creator a request to allow or deny.
 */
export function PeopleCard({ poll, joinRequests, viewerId, archived, onInviteMore, onRequestJoin, onDecide }: Props) {
  const people = usePeople()
  const [picking, setPicking] = useState(false)
  const isCreator = poll.creatorId === viewerId
  const creatorName = profileOf(people, poll.creatorId).displayName
  const members = [poll.creatorId, ...poll.inviteeIds]
  const pending = joinRequests.filter((r) => r.status === 'pending')
  const pendingIds = new Set(pending.map((r) => r.userId))
  const candidates = people.friends.filter((f) => !isInPoll(poll, f.id) && !pendingIds.has(f.id))
  const myPending = pending.filter((r) => r.requestedById === viewerId)
  const full = isFull(poll)
  const nameOf = (id: string): string => profileOf(people, id).displayName

  function pick(friendId: string): void {
    if (isCreator) onInviteMore(friendId)
    else onRequestJoin(friendId)
    setPicking(false)
  }

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold">
          People{' '}
          <span className="text-muted">
            {members.length}/{MAX_PEOPLE_PER_POLL}
          </span>
        </h2>
        {!archived && (
          <button
            type="button"
            aria-expanded={picking}
            disabled={full || candidates.length === 0}
            title={full ? 'This poll is full' : candidates.length === 0 ? 'All your friends are already in' : undefined}
            onClick={() => setPicking((open) => !open)}
            className="ml-auto rounded-lg px-2.5 py-1 text-sm font-semibold text-accent hover:bg-accent-soft disabled:text-muted disabled:opacity-50"
          >
            {isCreator ? '+ Invite more' : '+ Suggest a friend'}
          </button>
        )}
      </div>

      <ul className="mt-3 flex flex-wrap gap-2">
        {members.map((id) => (
          <li key={id} className="flex items-center gap-1.5 rounded-full bg-sunken py-1 pl-1 pr-3 text-sm">
            <Avatar profile={profileOf(people, id)} size="xs" />
            {id === viewerId ? 'You' : nameOf(id)}
            {id === poll.creatorId && <span className="text-xs text-muted">host</span>}
          </li>
        ))}
      </ul>

      {picking && !archived && (
        <div className="mt-3 rounded-lg border border-line p-2">
          <p className="px-1 pb-2 text-xs text-muted">
            {isCreator ? 'They get an invite right away.' : `${creatorName} gets a request and decides.`}
          </p>
          <ul className="space-y-1">
            {candidates.map((friend) => (
              <li key={friend.id} className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-sunken">
                <Avatar profile={friend} size="xs" />
                <span className="flex-1 text-sm">{friend.displayName}</span>
                <button
                  type="button"
                  onClick={() => pick(friend.id)}
                  className="rounded-md bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-on-bright"
                >
                  {isCreator ? 'Invite' : `Ask ${creatorName}`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isCreator && !archived && pending.length > 0 && (
        <div className="mt-4 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Requests to join</h3>
          {pending.map((request) => (
            <div key={request.id} className="flex items-center gap-2 rounded-lg bg-accent-soft/50 px-3 py-2 text-sm">
              <Avatar profile={profileOf(people, request.userId)} size="xs" />
              <span className="min-w-0 flex-1">
                <b className="font-semibold">{nameOf(request.requestedById)}</b> wants to add{' '}
                <b className="font-semibold">{nameOf(request.userId)}</b>
              </span>
              <button
                type="button"
                disabled={full}
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
            </div>
          ))}
        </div>
      )}

      {!isCreator && myPending.length > 0 && (
        <p className="mt-3 text-sm text-muted">
          Waiting for {creatorName} to allow: {myPending.map((r) => nameOf(r.userId)).join(', ')}
        </p>
      )}
    </section>
  )
}
