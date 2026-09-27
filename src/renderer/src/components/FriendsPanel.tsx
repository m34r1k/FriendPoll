import { usePeople } from '../lib/people'
import { Avatar } from './Avatar'

interface Props {
  /** Opens New poll with this friend already ticked. */
  onInvite: (friendId: string) => void
  /** Opens the Friends page. The "+ Add" button is disabled without it. */
  onAdd?: () => void
}

export function FriendsPanel({ onInvite, onAdd }: Props) {
  const { friends } = usePeople()
  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-line bg-surface">
      <div className="flex items-center justify-between px-4 pb-2 pt-6">
        <h2 className="text-sm font-semibold">
          Friends <span className="text-muted">{friends.length}</span>
        </h2>
        <button
          type="button"
          disabled={!onAdd}
          onClick={onAdd}
          title={onAdd ? 'Add or manage friends' : 'Sign in to add real friends'}
          className="text-sm font-semibold text-accent hover:underline disabled:no-underline disabled:opacity-50"
        >
          + Add
        </button>
      </div>
      <ul className="flex-1 overflow-y-auto px-2 pb-4">
        {friends.length === 0 && <li className="px-2 py-3 text-sm text-muted">No friends yet.</li>}
        {friends.map((friend) => (
          <li key={friend.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-sunken">
            <Avatar profile={friend} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{friend.displayName}</div>
              <div className="truncate text-xs text-muted">@{friend.username}</div>
            </div>
            <button
              type="button"
              onClick={() => onInvite(friend.id)}
              className="rounded-md px-2 py-1 text-xs font-semibold text-accent opacity-0 hover:bg-accent-soft focus:opacity-100 group-hover:opacity-100"
            >
              Invite
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
