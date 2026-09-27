import { useCallback, useEffect, useState } from 'react'
import type {
  Answer,
  AppNotification,
  JoinRequest,
  NotificationKind,
  Poll,
  PollResponse,
  Profile
} from '../types'
import { explainError } from './errors'
import { toProfile, type ProfileRow } from './profiles'
import { supabase } from './supabase'

export interface PollData {
  polls: Poll[]
  responses: PollResponse[]
  joinRequests: JoinRequest[]
  /** Newest first. */
  notifications: AppNotification[]
  profiles: Record<string, Profile>
  friends: Profile[]
}

// Row shapes as they come back from Supabase (snake_case, ISO date strings).
interface PollRow {
  id: string
  creator_id: string
  title: string
  min_people: number
  closes_at: string
  created_at: string
  poll_times: { id: string; starts_at: string; ends_at: string }[]
  poll_invitees: { user_id: string }[]
}
interface ResponseRow {
  time_id: string
  user_id: string
  answer: Answer
}
interface JoinRequestRow {
  id: string
  poll_id: string
  requested_by: string
  user_id: string
  status: JoinRequest['status']
  created_at: string
}
interface NotificationRow {
  id: string
  user_id: string
  kind: NotificationKind
  poll_id: string
  actor_id: string
  subject_id: string | null
  time_id: string | null
  answer: Answer | null
  join_request_id: string | null
  created_at: string
  read_at: string | null
}
interface FriendRow {
  user_id: string
  username: string
  display_name: string
  status: 'pending' | 'accepted'
}

function toPoll(row: PollRow): Poll {
  const times = row.poll_times
    .map((t) => ({ id: t.id, pollId: row.id, startsAt: new Date(t.starts_at), endsAt: new Date(t.ends_at) }))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
  return {
    id: row.id,
    creatorId: row.creator_id,
    title: row.title,
    inviteeIds: row.poll_invitees.map((i) => i.user_id),
    minPeople: row.min_people,
    times,
    closesAt: new Date(row.closes_at),
    createdAt: new Date(row.created_at)
  }
}

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    userId: row.user_id,
    kind: row.kind,
    pollId: row.poll_id,
    actorId: row.actor_id,
    subjectId: row.subject_id ?? undefined,
    timeId: row.time_id ?? undefined,
    answer: row.answer ?? undefined,
    joinRequestId: row.join_request_id ?? undefined,
    createdAt: new Date(row.created_at),
    readAt: row.read_at ? new Date(row.read_at) : null
  }
}

/**
 * Everything the signed-in person can see (the database rules decide what
 * that is), reloaded whenever a live update says something changed.
 */
export function usePollData(userId: string) {
  const [data, setData] = useState<PollData | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async (): Promise<void> => {
    const [polls, responses, requests, notifications, profiles, friends] = await Promise.all([
      supabase
        .from('polls')
        .select('id, creator_id, title, min_people, closes_at, created_at, poll_times(id, starts_at, ends_at), poll_invitees(user_id)'),
      supabase.from('poll_responses').select('time_id, user_id, answer').not('answer', 'is', null),
      supabase.from('join_requests').select('id, poll_id, requested_by, user_id, status, created_at'),
      supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('profiles').select('id, username, display_name'),
      supabase.rpc('list_friends')
    ])
    for (const result of [polls, responses, requests, notifications, profiles, friends]) {
      if (result.error) {
        setError(explainError(result.error))
        return
      }
    }

    const profileMap: Record<string, Profile> = {}
    for (const row of (profiles.data ?? []) as unknown as ProfileRow[]) profileMap[row.id] = toProfile(row)
    const friendList = ((friends.data ?? []) as unknown as FriendRow[])
      .filter((f) => f.status === 'accepted')
      .map((f) => toProfile({ id: f.user_id, username: f.username, display_name: f.display_name }))

    setError(null)
    setData({
      polls: ((polls.data ?? []) as unknown as PollRow[]).map(toPoll),
      responses: ((responses.data ?? []) as unknown as ResponseRow[]).map((r) => ({
        timeId: r.time_id,
        userId: r.user_id,
        answer: r.answer
      })),
      joinRequests: ((requests.data ?? []) as unknown as JoinRequestRow[]).map((r) => ({
        id: r.id,
        pollId: r.poll_id,
        requestedById: r.requested_by,
        userId: r.user_id,
        status: r.status,
        createdAt: new Date(r.created_at)
      })),
      notifications: ((notifications.data ?? []) as unknown as NotificationRow[]).map(toNotification),
      profiles: profileMap,
      friends: friendList
    })
  }, [])

  /** Change the local copy right away (e.g. an answer), before the server confirms. */
  const patch = useCallback((change: (current: PollData) => PollData): void => {
    setData((current) => (current ? change(current) : current))
  }, [])

  useEffect(() => {
    void refresh()

    // Several changes often land together (an answer + its notifications), so
    // wait a moment and reload once.
    let timer: ReturnType<typeof setTimeout> | undefined
    const soon = (): void => {
      clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 250)
    }

    const channel = supabase
      .channel(`poll-data-${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_responses' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_invitees' }, soon)
      .subscribe()

    // Safety net in case a live update is missed (sleep, network drop).
    const interval = setInterval(soon, 60_000)
    window.addEventListener('focus', soon)
    return () => {
      clearTimeout(timer)
      clearInterval(interval)
      window.removeEventListener('focus', soon)
      void supabase.removeChannel(channel)
    }
  }, [userId, refresh])

  return { data, error, refresh, patch }
}
