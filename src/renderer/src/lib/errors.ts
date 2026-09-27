/** Turns Supabase / Postgres errors into something a person can act on. */
export function explainError(error: { message?: string; code?: string } | null | undefined): string {
  const message = error?.message ?? 'Something went wrong.'
  const code = error?.code ?? ''

  if (
    ['PGRST202', 'PGRST205', '42883', '42P01'].includes(code) ||
    /could not find the (function|table)|schema cache/i.test(message)
  ) {
    return "The database is missing a setup step. Run the files in supabase/migrations, in order, in the Supabase SQL Editor."
  }
  if (/invalid login credentials/i.test(message)) return 'Wrong email or password.'
  if (/email not confirmed/i.test(message)) return 'Confirm your email first (check your inbox), then sign in.'
  if (/user already registered/i.test(message)) return 'An account with that email already exists. Try signing in.'
  if (/database error saving new user/i.test(message)) {
    return "Couldn't create the account. The username may have just been taken - try another one."
  }
  if (/rate limit/i.test(message)) return 'Too many attempts. Wait a few minutes and try again.'
  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "Can't reach Supabase. Check your internet connection."
  }
  return message
}
