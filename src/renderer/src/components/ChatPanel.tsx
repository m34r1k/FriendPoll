import { useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { profileOf, usePeople } from '../lib/people'
import { formatMessageTime } from '../lib/time'
import type { ChatMessage } from '../types'
import { Avatar } from './Avatar'

interface Props {
  messages: ChatMessage[]
  peopleCount: number
  viewerId: string
  now: Date
  onSend: (content: string) => void
}

/** A poll's own chat - only the creator and invited friends can see it. */
export function ChatPanel({ messages, peopleCount, viewerId, now, onSend }: Props) {
  const [draft, setDraft] = useState('')
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

      <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-y-auto">
        <div ref={contentRef} className="space-y-3 px-4 py-4">
          {messages.length === 0 && <p className="text-center text-sm text-muted">No messages yet.</p>}
          {messages.map((message) => {
            const author = profileOf(people, message.authorId)
            const mine = message.authorId === viewerId
            return (
              <div key={message.id} className={`flex gap-2 ${mine ? 'flex-row-reverse' : ''}`}>
                {!mine && <Avatar profile={author} size="sm" />}
                <div className={`flex max-w-[80%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  <div className="mb-0.5 text-[11px] text-muted">
                    {mine ? 'You' : author.displayName} · {formatMessageTime(message.createdAt, now)}
                  </div>
                  <div
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm ${mine ? 'rounded-tr-sm bg-accent text-white' : 'rounded-tl-sm bg-sunken'}`}
                  >
                    {message.content}
                  </div>
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
          placeholder="Message"
          aria-label="Message"
          className="w-full rounded-lg bg-sunken px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-accent/40"
        />
      </form>
    </aside>
  )
}
