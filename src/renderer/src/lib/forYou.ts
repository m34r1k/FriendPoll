import type { AppNotification, JoinRequest, Poll, PollResponse } from '../types'
import { profileOf, type People } from './people'
import { isArchived, summarizeTimes } from './sessions'
import { formatSlot } from './time'

/**
 * "For you": the notifications most likely to want something from you, and a
 * plain reason why. This is ordinary code, no AI - it can only weigh things it
 * can count (who you usually say Yes to, what starts soonest, what is one Yes
 * short). Phase 3b adds Gemini on top, which can also read the titles and the
 * chat.
 */
export interface Ranked {
  notification: AppNotification
  /** Higher comes first. */
  score: number
  /** The strongest reason, shown under the notification. */
  reason: string
}

const HOUR_MS = 3_600_000

interface Input {
  /** Newest first. */
  notifications: AppNotification[]
  polls: Poll[]
  responses: PollResponse[]
  joinRequests: JoinRequest[]
  viewerId: string
  now: Date
  people: People
}

/** How many of this person's recent polls you said Yes to. */
function historyWith(creatorId: string, input: Input): { asked: number; joined: number } {
  const theirs = input.polls
    .filter((p) => p.creatorId === creatorId && p.inviteeIds.includes(input.viewerId))
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 10)
  const joined = theirs.filter((poll) =>
    poll.times.some((time) =>
      input.responses.some(
        (r) => r.timeId === time.id && r.userId === input.viewerId && r.answer === 'yes'
      )
    )
  ).length
  return { asked: theirs.length, joined }
}

export function rankForYou(input: Input): Ranked[] {
  const { viewerId, now, people } = input
  const ranked: Ranked[] = []
  // One line per poll and kind: a busy poll shouldn't fill the whole list.
  const shown = new Set<string>()

  for (const notification of input.notifications) {
    const poll = input.polls.find((p) => p.id === notification.pollId)
    if (!poll || isArchived(poll, now)) continue
    const group = `${poll.id}:${notification.kind}`
    if (shown.has(group)) continue

    const summaries = summarizeTimes(poll, input.responses)
    const mySummary = summaries.find((s) => s.time.id === notification.timeId)
    const answeredThisPoll = poll.times.some((time) =>
      input.responses.some((r) => r.timeId === time.id && r.userId === viewerId)
    )
    const needsMyAnswer = poll.inviteeIds.includes(viewerId) && !answeredThisPoll
    const nextStart = poll.times
      .map((t) => t.startsAt)
      .filter((start) => start.getTime() > now.getTime())
      .sort((a, b) => a.getTime() - b.getTime())[0]

    let score = 0
    let reason = ''
    let strongest = 0
    /** Adds to the score; the heaviest signal is the reason we show. */
    const add = (weight: number, text?: string): void => {
      score += weight
      if (text && weight > strongest) {
        strongest = weight
        reason = text
      }
    }

    if (notification.kind === 'invited' && needsMyAnswer) {
      add(100, "You haven't answered this one yet")
    }
    if (notification.kind === 'join_request') {
      const request = input.joinRequests.find((r) => r.id === notification.joinRequestId)
      if (request?.status === 'pending') add(90, 'Waiting for you to allow or deny')
    }
    if (notification.kind === 'session_on' && mySummary?.going.includes(viewerId)) {
      add(70, `It's on - ${formatSlot(mySummary.time.startsAt, now)}`)
    }
    if (notification.kind === 'answered' && poll.creatorId === viewerId) {
      if (mySummary?.needed === 1) add(65, 'One more Yes and this time is on')
      else if (mySummary && !mySummary.isSession) add(25, `${mySummary.needed} more Yes needed`)
    }
    if (needsMyAnswer) {
      const { asked, joined } = historyWith(poll.creatorId, input)
      if (asked >= 2 && joined / asked >= 0.5) {
        const name = profileOf(people, poll.creatorId).displayName
        add(Math.round(30 * (joined / asked)), `You said Yes to ${joined} of ${name}'s last ${asked} polls`)
      }
    }
    if (nextStart && nextStart.getTime() - now.getTime() < 12 * HOUR_MS) {
      add(35, `Starts ${formatSlot(nextStart, now)}`)
    }
    if (!notification.readAt) add(15)
    // Yesterday's news drops away even if it scored well at the time.
    score -= Math.min(40, (now.getTime() - notification.createdAt.getTime()) / (4 * HOUR_MS))

    if (score < 20 || !reason) continue
    shown.add(group)
    ranked.push({ notification, score, reason })
  }

  return ranked.sort((a, b) => b.score - a.score).slice(0, 12)
}
