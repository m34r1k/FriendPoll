import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { explainError } from '../lib/errors'
import { toProfile } from '../lib/profiles'
import { supabase } from '../lib/supabase'
import { Avatar } from './Avatar'

/** A row from public.list_friends(). */
interface FriendRow {
  user_id: string
  username: string
  display_name: string
  status: 'pending' | 'accepted'
  requested_by_me: boolean
}

type RpcResult = PromiseLike<{ error: { message: string; code?: string } | null }>

const SEND_RESULT: Record<string, (username: string) => string> = {
  sent: (u) => `Request sent to @${u}.`,
  accepted: (u) => `@${u} had already asked you - you're friends now.`,
  already_friends: (u) => `You and @${u} are already friends.`,
  already_requested: (u) => `You already sent @${u} a request.`
}

/** Your friends, requests for you, and requests you've sent. */
export function FriendsScreen({ onChanged }: { onChanged?: () => void }) {
  const [rows, setRows] = useState<FriendRow[] | null>(null)
  const [username, setUsername] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    const { data, error: loadError } = await supabase.rpc('list_friends')
    if (loadError) setError(explainError(loadError))
    else setRows(data as FriendRow[])
  }, [])

  useEffect(() => {
    void load()
    // No live updates until Phase 2: re-check every 20 seconds and whenever
    // the window comes back into focus.
    const timer = setInterval(() => void load(), 20_000)
    const onFocus = (): void => void load()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', onFocus)
    }
  }, [load])

  async function run(action: () => RpcResult): Promise<void> {
    setBusy(true)
    setError(null)
    setNotice(null)
    const { error: actionError } = await action()
    setBusy(false)
    setConfirmingRemove(null)
    if (actionError) setError(explainError(actionError))
    await load()
    onChanged?.()
  }

  async function sendRequest(event: FormEvent): Promise<void> {
    event.preventDefault()
    const target = username.trim().replace(/^@/, '').toLowerCase()
    if (!target) return
    setBusy(true)
    setError(null)
    setNotice(null)
    const { data, error: sendError } = await supabase.rpc('send_friend_request', { target_username: target })
    setBusy(false)
    if (sendError) {
      setError(explainError(sendError))
      return
    }
    setNotice(SEND_RESULT[data as string]?.(target) ?? 'Done.')
    setUsername('')
    await load()
    onChanged?.()
  }

  const incoming = rows?.filter((r) => r.status === 'pending' && !r.requested_by_me) ?? []
  const friends = rows?.filter((r) => r.status === 'accepted') ?? []
  const outgoing = rows?.filter((r) => r.status === 'pending' && r.requested_by_me) ?? []

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-lg font-bold tracking-tight">Friends</h2>

      <form onSubmit={sendRequest} className="mt-3 flex gap-2">
        <div className="flex flex-1 items-center rounded-lg border border-line focus-within:border-accent">
          <span className="pl-3 text-sm text-muted">@</span>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            maxLength={21}
            aria-label="Friend's username"
            placeholder="their username"
            className="w-full bg-transparent px-1 py-2 text-sm outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={busy || username.trim() === ''}
          className="rounded-lg bg-accent px-4 text-sm font-semibold text-on-bright hover:bg-accent-strong disabled:opacity-50"
        >
          Send request
        </button>
      </form>
      {notice && <p className="mt-2 text-sm text-go">{notice}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-accent">
          {error}
        </p>
      )}

      {rows === null && !error && <p className="mt-6 text-sm text-muted">Loading…</p>}

      {incoming.length > 0 && (
        <Group title={`Requests for you (${incoming.length})`}>
          {incoming.map((row) => (
            <PersonRow key={row.user_id} row={row}>
              <SmallButton
                tone="go"
                disabled={busy}
                onClick={() => void run(() => supabase.rpc('respond_friend_request', { other_id: row.user_id, accept: true }))}
              >
                Accept
              </SmallButton>
              <SmallButton
                disabled={busy}
                onClick={() => void run(() => supabase.rpc('respond_friend_request', { other_id: row.user_id, accept: false }))}
              >
                Decline
              </SmallButton>
            </PersonRow>
          ))}
        </Group>
      )}

      {rows !== null && (
        <Group title={`Your friends (${friends.length})`}>
          {friends.length === 0 ? (
            <li className="py-2 text-sm text-muted">No friends yet. Send a request by username above.</li>
          ) : (
            friends.map((row) => (
              <PersonRow key={row.user_id} row={row}>
                {confirmingRemove === row.user_id ? (
                  <>
                    <span className="text-xs text-muted">Remove?</span>
                    <SmallButton
                      tone="danger"
                      disabled={busy}
                      onClick={() => void run(() => supabase.rpc('remove_friend', { other_id: row.user_id }))}
                    >
                      Remove
                    </SmallButton>
                    <SmallButton onClick={() => setConfirmingRemove(null)}>Keep</SmallButton>
                  </>
                ) : (
                  <SmallButton onClick={() => setConfirmingRemove(row.user_id)}>Remove</SmallButton>
                )}
              </PersonRow>
            ))
          )}
        </Group>
      )}

      {outgoing.length > 0 && (
        <Group title="Sent requests">
          {outgoing.map((row) => (
            <PersonRow key={row.user_id} row={row} note="waiting for them to accept">
              <SmallButton
                disabled={busy}
                onClick={() => void run(() => supabase.rpc('remove_friend', { other_id: row.user_id }))}
              >
                Cancel
              </SmallButton>
            </PersonRow>
          ))}
        </Group>
      )}
    </section>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
      <ul className="divide-y divide-line">{children}</ul>
    </div>
  )
}

function PersonRow({ row, note, children }: { row: FriendRow; note?: string; children: ReactNode }) {
  const profile = toProfile({ id: row.user_id, username: row.username, display_name: row.display_name })
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar profile={profile} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{profile.displayName}</div>
        <div className="truncate text-xs text-muted">
          @{profile.username}
          {note && ` · ${note}`}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </li>
  )
}

const TONES = {
  plain: 'border border-line text-ink hover:bg-sunken',
  go: 'bg-go text-on-bright hover:opacity-90',
  danger: 'bg-accent text-on-bright hover:bg-accent-strong'
}

function SmallButton({
  tone = 'plain',
  disabled,
  onClick,
  children
}: {
  tone?: keyof typeof TONES
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg px-3 py-1 text-xs font-semibold disabled:opacity-50 ${TONES[tone]}`}
    >
      {children}
    </button>
  )
}
