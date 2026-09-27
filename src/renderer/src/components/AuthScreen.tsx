import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { explainError } from '../lib/errors'
import { supabase, supabaseConfigured } from '../lib/supabase'

type Mode = 'sign-in' | 'sign-up' | 'reset'
type UsernameStatus = 'idle' | 'invalid' | 'checking' | 'free' | 'taken'

/** Same rule as the database: 3-20 lowercase letters, numbers or _. */
const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/
const MIN_PASSWORD = 8

export function AuthScreen({ onOpenDemo }: { onOpenDemo: () => void }) {
  const [mode, setMode] = useState<Mode>('sign-in')
  const [displayName, setDisplayName] = useState('')
  const [username, setUsername] = useState('')
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  /** Reset only: true once a code has been emailed. */
  const [codeSent, setCodeSent] = useState(false)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  // Check the username while it's typed (after a short pause).
  useEffect(() => {
    if (mode !== 'sign-up' || username === '') {
      setUsernameStatus('idle')
      return
    }
    if (!USERNAME_PATTERN.test(username)) {
      setUsernameStatus('invalid')
      return
    }
    setUsernameStatus('checking')
    let cancelled = false
    const timer = setTimeout(async () => {
      const { data, error: checkError } = await supabase.rpc('username_available', { name: username })
      if (cancelled) return
      if (checkError) {
        setUsernameStatus('idle')
        setError(explainError(checkError))
      } else {
        setUsernameStatus(data ? 'free' : 'taken')
      }
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [mode, username])

  function switchMode(next: Mode): void {
    setMode(next)
    setError(null)
    setNotice(null)
    setCodeSent(false)
    setCode('')
    if (next !== 'sign-in') setPassword('')
  }

  const canSubmit = (): boolean => {
    if (mode === 'sign-in') return email.trim() !== '' && password !== ''
    if (mode === 'sign-up') {
      return (
        displayName.trim() !== '' &&
        usernameStatus === 'free' &&
        email.trim() !== '' &&
        password.length >= MIN_PASSWORD
      )
    }
    return codeSent ? code.trim().length >= 6 && password.length >= MIN_PASSWORD : email.trim() !== ''
  }

  async function submit(event: FormEvent): Promise<void> {
    event.preventDefault()
    if (!canSubmit() || busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'sign-in') {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (signInError) setError(explainError(signInError))
        return
      }

      if (mode === 'sign-up') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { username, display_name: displayName.trim() } }
        })
        if (signUpError) setError(explainError(signUpError))
        else if (!data.session) {
          // Email confirmation is on for this project.
          switchMode('sign-in')
          setNotice('Account created. Check your email for a confirmation link, then sign in here.')
        }
        return
      }

      // Forgot password, step 1: email a code.
      if (!codeSent) {
        const { error: sendError } = await supabase.auth.resetPasswordForEmail(email.trim())
        if (sendError) setError(explainError(sendError))
        else {
          setCodeSent(true)
          setNotice('Check your email for a 6-digit code, then set a new password below.')
        }
        return
      }

      // Forgot password, step 2: the code signs you in, then set the password.
      const { error: codeError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'recovery'
      })
      if (codeError) {
        setError(explainError(codeError))
        return
      }
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) setError(explainError(updateError))
      // On success the app is already signed in, so this screen goes away.
    } finally {
      setBusy(false)
    }
  }

  const usernameHint: Record<UsernameStatus, ReactNode> = {
    idle: '3-20 lowercase letters, numbers or _',
    invalid: <span className="text-accent">Only a-z, 0-9 and _, 3-20 long</span>,
    checking: 'Checking…',
    free: <span className="text-go">Available ✓</span>,
    taken: <span className="text-accent">Already taken</span>
  }
  const inputClass = 'w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent'
  const submitLabel = mode === 'sign-in' ? 'Sign in' : mode === 'sign-up' ? 'Create account' : codeSent ? 'Set new password' : 'Email me a code'

  return (
    <div className="h-screen overflow-y-auto bg-bg text-ink">
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center justify-center gap-2 text-xl font-bold tracking-tight">
            <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-sm text-white">FP</span>
            FriendPoll
          </div>

          <div className="rounded-2xl border border-line bg-surface p-6 shadow-sm">
            {mode === 'reset' ? (
              <div className="mb-5">
                <h2 className="text-base font-bold">Forgot your password</h2>
                <p className="text-sm text-muted">
                  {codeSent
                    ? 'Enter the code from your email and pick a new password.'
                    : "We'll email you a 6-digit code."}
                </p>
              </div>
            ) : (
              <div className="mb-5 flex rounded-lg bg-sunken p-1">
                {(['sign-in', 'sign-up'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={mode === m}
                    onClick={() => switchMode(m)}
                    className={`flex-1 rounded-md py-1.5 text-sm font-semibold ${mode === m ? 'bg-surface shadow-sm' : 'text-muted'}`}
                  >
                    {m === 'sign-in' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>
            )}

            {!supabaseConfigured && (
              <p className="mb-4 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                Supabase isn't configured. Copy .env.example to .env and fill it in.
              </p>
            )}

            <form onSubmit={submit} className="space-y-4">
              {mode === 'sign-up' && (
                <>
                  <Field label="Name" hint="What your friends see">
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      maxLength={40}
                      autoComplete="nickname"
                      placeholder="Avery"
                      className={inputClass}
                    />
                  </Field>
                  <Field label="Username" hint={usernameHint[usernameStatus]}>
                    <div className="flex items-center rounded-lg border border-line bg-surface focus-within:border-accent">
                      <span className="pl-3 text-sm text-muted">@</span>
                      <input
                        value={username}
                        onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                        maxLength={20}
                        autoComplete="username"
                        aria-label="Username"
                        placeholder="avery"
                        className="w-full bg-transparent px-1 py-2 text-sm outline-none"
                      />
                    </div>
                  </Field>
                </>
              )}

              <Field label="Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  readOnly={mode === 'reset' && codeSent}
                  autoComplete="email"
                  aria-label="Email"
                  className={`${inputClass} ${mode === 'reset' && codeSent ? 'text-muted' : ''}`}
                />
              </Field>

              {mode === 'reset' && codeSent && (
                <Field label="Code from your email" hint="6 digits">
                  <input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    maxLength={8}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label="Code from your email"
                    placeholder="123456"
                    className={`${inputClass} tracking-widest`}
                  />
                </Field>
              )}

              {(mode !== 'reset' || codeSent) && (
                <Field
                  label={mode === 'reset' ? 'New password' : 'Password'}
                  hint={mode === 'sign-in' ? undefined : `At least ${MIN_PASSWORD} characters`}
                >
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                    aria-label={mode === 'reset' ? 'New password' : 'Password'}
                    className={inputClass}
                  />
                </Field>
              )}

              {error && (
                <p role="alert" className="rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent">
                  {error}
                </p>
              )}
              {notice && <p className="rounded-lg bg-go-soft px-3 py-2 text-sm text-go">{notice}</p>}

              <button
                type="submit"
                disabled={busy || !canSubmit()}
                className="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
              >
                {busy ? 'Please wait…' : submitLabel}
              </button>
            </form>

            <div className="mt-4 text-center text-sm">
              {mode === 'sign-in' ? (
                <button type="button" onClick={() => switchMode('reset')} className="font-medium text-muted hover:text-ink">
                  Forgot your password?
                </button>
              ) : mode === 'reset' ? (
                <button type="button" onClick={() => switchMode('sign-in')} className="font-medium text-muted hover:text-ink">
                  ← Back to sign in
                </button>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            onClick={onOpenDemo}
            className="mt-4 w-full text-center text-sm font-medium text-muted hover:text-ink"
          >
            Just looking? Open the demo with fake data →
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  )
}
