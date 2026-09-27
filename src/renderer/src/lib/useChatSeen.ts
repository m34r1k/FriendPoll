import { useCallback, useState } from 'react'

/**
 * When you last had each poll's chat open, so Home can badge the ones with
 * messages you haven't seen. It's a per-computer thing, like an unread mark in
 * a mail app, so it lives in local storage rather than the database.
 */
type Seen = Record<string, number>

const keyFor = (userId: string): string => `friendpoll.chatSeen.${userId}`
/** Old polls close and stop mattering; don't keep their marks forever. */
const KEEP = 200

function read(userId: string): Seen {
  try {
    const raw = localStorage.getItem(keyFor(userId))
    if (!raw) return {}
    const saved = JSON.parse(raw) as Record<string, unknown>
    const seen: Seen = {}
    for (const [pollId, at] of Object.entries(saved)) {
      if (typeof at === 'number' && Number.isFinite(at)) seen[pollId] = at
    }
    return seen
  } catch {
    return {}
  }
}

function write(userId: string, seen: Seen): void {
  try {
    const newest = Object.entries(seen)
      .sort((a, b) => b[1] - a[1])
      .slice(0, KEEP)
    localStorage.setItem(keyFor(userId), JSON.stringify(Object.fromEntries(newest)))
  } catch {
    // Storage full or blocked: badges just won't stick across restarts.
  }
}

export function useChatSeen(userId: string) {
  const [seen, setSeen] = useState<Seen>(() => read(userId))

  const markSeen = useCallback(
    (pollId: string, at: Date = new Date()): void => {
      setSeen((current) => {
        if ((current[pollId] ?? 0) >= at.getTime()) return current
        const next = { ...current, [pollId]: at.getTime() }
        write(userId, next)
        return next
      })
    },
    [userId]
  )

  return { seen, markSeen }
}

interface RecentMessage {
  pollId: string
  authorId: string
  createdAt: Date
}

/** How many messages you haven't seen in each poll (your own never count). */
export function unreadChat(messages: RecentMessage[], seen: Seen, viewerId: string): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const message of messages) {
    if (message.authorId === viewerId) continue
    if (message.createdAt.getTime() <= (seen[message.pollId] ?? 0)) continue
    counts[message.pollId] = (counts[message.pollId] ?? 0) + 1
  }
  return counts
}
