import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to be public (it ships in the app either way).
// Data is protected by the row-level security rules in supabase/schema.sql.
// Environment variables override these if set.
const url = import.meta.env.VITE_SUPABASE_URL || 'https://woovsqjqcxklcgiebuly.supabase.co'
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_4_1uzEjUB77INb-EQGT1Aw_sPqlZmKr'

export const configured = Boolean(url && key)

export const supabase = createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true } })
