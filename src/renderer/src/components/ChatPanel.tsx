import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { profileOf, usePeople } from '../lib/people'
import { formatMessageTime } from '../lib/time'
import type { ChatMessage } from '../types'
import { Avatar } from './Avatar'

interface Props {
  /** null while the messages are still loading. */
  messages: ChatMessage[] | null
  peopleCount: number
  viewerId: string
  now: Date
  onSend: (content: string) => void
  /** Older messages exist; shows a "load older" button. */
  hasMore?: boolean
  onLoadOlder?: () => void
  /** Lets you delete your own messages. */
  onDelete?: (messageId: string) => void
  error?: string | null
}

/** A poll's own chat - only the creator and invited friends can see it. */
export function ChatPanel({
  messages,
  peopleCount,
  viewerId,
  now,
  onSend,
  hasMore = false,
  onLoadOlder,
  onDelete,
  error = null
}: Props) {
  const [draft, setDraft] = useState('')
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null)
  const people = usePeople()
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  /** False while the reader has scrolled up to read older messages. */
  const pinnedToBottom = useRef(true)

  // Keep the newest message in view whenever the content or the window
  // changes size, unless the reader scrolled up.
  useLayoutEffect(() => {
    const scroller = scrollRef.current
    const content = contentRef.current
    if (!scroller || !content) return
    const follow = (): void => {
      if (pinnedToBottom.current) scroller.scrollTop = scroller.scrollHeight
    }
    follow()
    const observer = new ResizeObserver(follow)
    observer.observe(scroller)
    observer.observe(content)
    return () => observer.disconnect()
  }, [])

  function onScroll(): void {
    const s = scrollRef.current
    if (s) pinnedToBottom.current = s.scrollHeight - s.scrollTop - s.clientHeight < 48
  }

  function submit(event: FormEvent): void {
    event.preventDefault()
    const content = draft.trim()
    if (!content) return
    pinnedToBottom.current = true
    onSend(content)
    setDraft('')
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold">Chat</h2>
          <p className="truncate text-xs text-muted">Only the {peopleCount} people in this poll</p>
        </div>
        <button
          type="button"
          disabled
          title="AI summary of messages you missed (coming in Phase 3b)"
          className="rounded-md border border-line px-2 py-1 text-xs font-medium text-muted opacity-60"
        >
          ✨ Catch me up
        </button>
      </header>

      {error && (
        <p role="alert" className="border-b border-line bg-accent-soft px-4 py-2 text-xs text-accent">
          {error}
        </p>
      )}

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="space-y-3 px-4 py-4">
          {hasMore && onLoadOlder && (
            <button
              type="button"
              onClick={onLoadOlder}
              className="mx-auto block rounded-lg border border-line px-3 py-1 text-xs font-semibold text-muted hover:bg-sunken"
            >
              Load older messages
            </button>
          )}
          {messages === null && <p className="text-center text-sm text-muted">Loading…</p>}
          {messages?.length === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}

          {messages?.map((message) => {
            const author = profileOf(people, message.authorId)
            const mine = message.authorId === viewerId
            const deleted = Boolean(message.deletedAt)
            return (
              <div key={message.id} className={`group flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar profile={author} size="sm" />}
                <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="mb-0.5 text-[11px] text-muted">
                    {mine ? 'You' : author.displayName} · {formatMessageTime(message.createdAt, now)}
                  </div>
                  {deleted ? (
                    <div className="rounded-2xl border border-dashed border-line px-3 py-2 text-sm italic text-muted">
                      message deleted
                    </div>
                  ) : (
                    <div
                      className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-tr-sm bg-accent text-white' : 'rounded-tl-sm bg-sunken'}`}
                    >
                      {message.content}
                    </div>
                  )}
                  {mine && onDelete && !deleted && (
                    <div className="mt-0.5 flex gap-2 text-[11px]">
                      {confirmingDelete === message.id ? (
                        <>
                          <span className="text-muted">Delete?</span>
                          <button
                            type="button"
                            onClick={() => {
                              onDelete(message.id)
                              setConfirmingDelete(null)
                            }}
                            className="font-semibold text-accent"
                          >
                            Yes
                          </button>
                          <button type="button" onClick={() => setConfirmingDelete(null)} className="text-muted">
                            No
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmingDelete(message.id)}
                          className="text-muted opacity-0 hover:text-ink focus:opacity-100 group-hover:opacity-100"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-line p-3">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={2000}
          placeholder="Message"
          aria-label="Message"
          className="w-full rounded-lg bg-sunken px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </form>
    </aside>
  )
}
