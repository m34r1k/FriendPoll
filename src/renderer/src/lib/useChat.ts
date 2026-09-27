import { useCallback, useEffect, useState } from 'react'
import type { ChatMessage } from '../types'
import { explainError } from './errors'
import { supabase } from './supabase'

/** How many messages to load at a time. */
const PAGE = 50

interface MessageRow {
  id: string
  poll_id: string
  author_id: string
  content: string
  created_at: string
  deleted_at: string | null
}

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  pollId: row.poll_id,
  authorId: row.author_id,
  content: row.content,
  createdAt: new Date(row.created_at),
  deletedAt: row.deleted_at ? new Date(row.deleted_at) : null
})

/** One poll's chat: the newest messages, older ones on demand, new ones live. */
export function useChat(pollId: string | null) {
  const [messages, setMessages] = useState<ChatMessage[] | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Newest PAGE messages, or the ones just before `before`. */
  const loadPage = useCallback(
    async (before?: Date): Promise<ChatMessage[]> => {
      if (!pollId) return []
      let query = supabase
        .from('poll_messages')
        .select('id, poll_id, author_id, content, created_at, deleted_at')
        .eq('poll_id', pollId)
        .order('created_at', { ascending: false })
        .limit(PAGE)
      if (before) query = query.lt('created_at', before.toISOString())

      const { data, error: loadError } = await query
      if (loadError) {
        setError(explainError(loadError))
        return []
      }
      setError(null)
      setHasMore((data?.length ?? 0) === PAGE)
      return ((data ?? []) as unknown as MessageRow[]).map(toMessage).reverse()
    },
    [pollId]
  )

  const merge = useCallback((incoming: ChatMessage[]): void => {
    if (incoming.length === 0) return
    setMessages((current) => {
      const byId = new Map((current ?? []).map((m) => [m.id, m]))
      for (const message of incoming) byId.set(message.id, message)
      return [...byId.values()].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    })
  }, [])

  useEffect(() => {
    if (!pollId) {
      setMessages(null)
      return
    }
    let cancelled = false
    setMessages(null)
    void loadPage().then((rows) => {
      if (!cancelled) setMessages(rows)
    })

    const channel = supabase
      .channel(`poll-chat-${pollId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'poll_messages', filter: `poll_id=eq.${pollId}` },
        (payload) => {
          const row = payload.new as MessageRow | undefined
          if (row?.id) merge([toMessage(row)])
        }
      )
      .subscribe()

    return () => {
      cancelled = true
      void supabase.removeChannel(channel)
    }
  }, [pollId, loadPage, merge])

  const loadOlder = useCallback(async (): Promise<void> => {
    const oldest = messages?.[0]?.createdAt
    if (oldest) merge(await loadPage(oldest))
  }, [messages, loadPage, merge])

  const send = useCallback(
    async (content: string): Promise<void> => {
      if (!pollId) return
      const { error: sendError } = await supabase.rpc('send_message', { p_poll_id: pollId, p_content: content })
      if (sendError) {
        setError(explainError(sendError))
        return
      }
      // The live update usually arrives first; this makes sure your own
      // message shows even if it doesn't.
      merge(await loadPage())
    },
    [pollId, loadPage, merge]
  )

  const remove = useCallback(
    async (messageId: string): Promise<void> => {
      const { error: deleteError } = await supabase.rpc('delete_message', { p_message_id: messageId })
      if (deleteError) {
        setError(explainError(deleteError))
        return
      }
      merge(await loadPage())
    },
    [loadPage, merge]
  )

  return { messages, hasMore, error, loadOlder, send, remove }
}
