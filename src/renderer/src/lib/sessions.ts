import type { Answer, Poll, PollResponse, PollTime } from '../types'

/** Most people one poll can include, creator counted. */
export const MAX_PEOPLE_PER_POLL = 20

export interface TimeSummary {
  time: PollTime
  /** The creator first, then everyone who said Yes. */
  going: string[]
  maybe: string[]
  /** Enough people are going for this time to happen. */
  isSession: boolean
  /** Yes answers still needed (0 once it's a session). */
  needed: number
}

/**
 * Every time is judged on its own - there is no single winner. The creator is
 * in for every time they listed, a friend who said Yes to several times counts
 * toward all of them, and Maybe never counts.
 */
export function summarizeTimes(poll: Poll, responses: PollResponse[]): TimeSummary[] {
  return poll.times.map((time) => {
    const answers = responses.filter((r) => r.timeId === time.id)
    const who = (answer: Answer): string[] =>
      answers.filter((r) => r.answer === answer).map((r) => r.userId)
    const going = [poll.creatorId, ...who('yes')]
    return {
      time,
      going,
      maybe: who('maybe'),
      isSession: going.length >= poll.minPeople,
      needed: Math.max(0, poll.minPeople - going.length)
    }
  })
}

export function buildPoll(
  fields: Omit<Poll, 'times' | 'closesAt'>,
  startTimes: Date[],
  durationMinutes: number
): Poll {
  const times = [...startTimes]
    .sort((a, b) => a.getTime() - b.getTime())
    .map((startsAt, i) => ({
      id: `${fields.id}-t${i + 1}`,
      pollId: fields.id,
      startsAt,
      endsAt: new Date(startsAt.getTime() + durationMinutes * 60_000)
    }))
  return { ...fields, times, closesAt: new Date(Math.max(...times.map((t) => t.endsAt.getTime()))) }
}

export function isArchived(poll: Poll, now: Date): boolean {
  return now.getTime() > poll.closesAt.getTime()
}

export function isFull(poll: Poll): boolean {
  return poll.inviteeIds.length + 1 >= MAX_PEOPLE_PER_POLL
}

/** The creator or an invitee - the only people who can see the poll. */
export function isInPoll(poll: Poll, userId: string): boolean {
  return poll.creatorId === userId || poll.inviteeIds.includes(userId)
}

/** Invitees who haven't marked any time yet (maybe they're just not free). */
export function notAnswered(poll: Poll, responses: PollResponse[]): string[] {
  const timeIds = new Set(poll.times.map((t) => t.id))
  const answered = new Set(responses.filter((r) => timeIds.has(r.timeId)).map((r) => r.userId))
  return poll.inviteeIds.filter((id) => !answered.has(id))
}
