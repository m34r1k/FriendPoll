import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

/** False when .env is missing its values; the sign-in screen says so. */
export const supabaseConfigured = Boolean(url && key)

// The publishable key is public by design. What people can see and do is
// enforced by the database rules in supabase/migrations.
export const supabase = createClient(url ?? 'https://not-configured.invalid', key ?? 'not-configured', {
  auth: { persistSession: true, autoRefreshToken: true }
})
