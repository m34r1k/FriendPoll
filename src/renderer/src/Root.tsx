import type { Session } from '@supabase/supabase-js'
import { useEffect, useState } from 'react'
import { AuthScreen } from './components/AuthScreen'
import { DemoApp } from './DemoApp'
import { supabase } from './lib/supabase'
import { RealApp } from './RealApp'

/** Sign-in screen, the real app once signed in, or the fake-data demo. */
export default function Root() {
  const [session, setSession] = useState<Session | null>(null)
  const [checkedSession, setCheckedSession] = useState(false)
  const [demo, setDemo] = useState(false)

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setCheckedSession(true)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next))
    return () => data.subscription.unsubscribe()
  }, [])

  if (demo) return <DemoApp onExit={() => setDemo(false)} />
  if (!checkedSession) {
    return <div className="flex h-screen items-center justify-center bg-bg text-sm text-muted">Loading…</div>
  }
  if (!session) return <AuthScreen onOpenDemo={() => setDemo(true)} />
  return <RealApp session={session} onOpenDemo={() => setDemo(true)} />
}
