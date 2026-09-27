// Shapes mirror the planned Supabase tables (PLAN.txt section 5), in camelCase.

/** There is no "no": not being free means leaving a time blank. */
export type Answer = 'yes' | 'maybe'

export interface Profile {
  id: string
  username: string
  displayName: string
  /** Stand-in for avatar_url until real avatars exist. */
  avatarColor: string
}

export interface PollTime {
  id: string
  pollId: string
  startsAt: Date
  endsAt: Date
}

export interface Poll {
  id: string
  creatorId: string
  title: string
  /** Friends the creator invited. The creator is not in this list. */
  inviteeIds: string[]
  /** People needed for a time to happen, counting the creator. */
  minPeople: number
  times: PollTime[]
  /** End of the last time. Answers lock after this. */
  closesAt: Date
  createdAt: Date
}

export interface PollResponse {
  timeId: string
  userId: string
  answer: Answer
}

export interface ChatMessage {
  id: string
  pollId: string
  authorId: string
  content: string
  createdAt: Date
}

export type JoinRequestStatus = 'pending' | 'approved' | 'denied'

/** An invitee asking the creator to let one of their friends join. */
export interface JoinRequest {
  id: string
  pollId: string
  requestedById: string
  /** The friend who would join. */
  userId: string
  status: JoinRequestStatus
  createdAt: Date
}

export type NotificationKind =
  /** actor invited you; subject = who suggested you, if anyone */
  | 'invited'
  /** actor wants subject added to your poll */
  | 'join_request'
  /** actor (the creator) added subject, as you asked */
  | 'join_approved'
  /** actor (the creator) didn't add subject */
  | 'join_denied'
  /** actor answered a time in your poll */
  | 'answered'
  /** a time you're going to now has enough people */
  | 'session_on'

/** Named to avoid clashing with the browser's built-in Notification. */
export interface AppNotification {
  id: string
  /** Who receives it. */
  userId: string
  kind: NotificationKind
  pollId: string
  /** Who caused it. */
  actorId: string
  /** The other person involved: the friend to add, or who suggested you. */
  subjectId?: string
  timeId?: string
  answer?: Answer
  joinRequestId?: string
  createdAt: Date
  readAt: Date | null
}

/** What the creator fills in on the New poll form. */
export interface PollDraft {
  title: string
  startTimes: Date[]
  durationMinutes: number
  inviteeIds: string[]
  minPeople: number
}
