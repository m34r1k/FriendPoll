import type { ReactNode } from 'react'
import { profileOf, usePeople } from '../lib/people'
import type { Profile } from '../types'
import { Avatar } from './Avatar'

interface Props {
  viewerId: string
  unreadCount: number
  notificationsOpen: boolean
  onToggleNotifications: () => void
  onHome: () => void
  onNewPoll: () => void
  /** Demo only: the people "view as" can switch between. */
  demoViewers?: Profile[]
  onSwitchViewer?: (id: string) => void
  /** Demo only: leaves the demo, back to sign-in or your account. */
  onExitDemo?: () => void
  /** Extra controls before "+ New poll". */
  leading?: ReactNode
  /** Extra controls after the avatar. */
  trailing?: ReactNode
  /** Leave out to hide the gear (nothing to open). */
  onOpenSettings?: () => void
}

export function TopBar({
  viewerId,
  unreadCount,
  notificationsOpen,
  onToggleNotifications,
  onHome,
  onNewPoll,
  demoViewers,
  onSwitchViewer,
  onExitDemo,
  leading,
  trailing,
  onOpenSettings
}: Props) {
  const people = usePeople()
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-5">
      <button type="button" onClick={onHome} className="flex items-center gap-2 font-bold tracking-tight">
        <span className="flex size-8 items-center justify-center rounded-lg bg-accent text-sm text-on-bright">FP</span>
        FriendPoll
      </button>

      <div className="ml-auto flex items-center gap-3">
        {demoViewers && onSwitchViewer && (
          <label
            className="flex items-center gap-2 rounded-lg border border-dashed border-line px-2 py-1 text-xs text-muted"
            title="Demo only: see the app as another friend"
          >
            Demo: view as
            <select
              value={viewerId}
              onChange={(e) => onSwitchViewer(e.target.value)}
              className="rounded bg-sunken px-1 py-0.5 text-sm text-ink outline-none"
            >
              {demoViewers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.displayName}
                </option>
              ))}
            </select>
          </label>
        )}
        {onExitDemo && (
          <button type="button" onClick={onExitDemo} className="text-xs font-semibold text-muted hover:text-ink">
            Exit demo
          </button>
        )}
        {leading}
        <button
          type="button"
          onClick={onNewPoll}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-bright shadow-sm hover:bg-accent-strong"
        >
          + New poll
        </button>
        <button
          type="button"
          data-notification-bell
          aria-label={`Notifications, ${unreadCount} unread`}
          aria-expanded={notificationsOpen}
          onClick={onToggleNotifications}
          className={`relative flex size-9 items-center justify-center rounded-lg text-ink hover:bg-sunken ${notificationsOpen ? 'bg-sunken' : ''}`}
        >
          <svg
            viewBox="0 0 24 24"
            className="size-5"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-on-bright">
              {unreadCount}
            </span>
          )}
        </button>
        {onOpenSettings && (
          <button
            type="button"
            aria-label="Settings"
            title="Settings"
            onClick={onOpenSettings}
            className="flex size-9 items-center justify-center rounded-lg text-ink hover:bg-sunken"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.17V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.26 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 3 15a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 7.26a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 3a2 2 0 0 1 4 0v.09A1.65 1.65 0 0 0 16.74 4.6a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 21 9a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
        )}
        <Avatar profile={profileOf(people, viewerId)} size="sm" />
        {trailing}
      </div>
    </header>
  )
}
