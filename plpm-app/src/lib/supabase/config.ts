// Supabase connection values.
//
// These are PUBLIC by design: the anon key is meant to be shipped in the
// browser bundle and the database is protected by Row-Level Security, not by
// keeping this key secret. Environment variables take precedence when set
// (e.g. in Vercel), but we fall back to the project defaults so the app works
// out of the box without extra configuration.
export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  'https://trnvibgjjcahegjjxoaz.supabase.co'

export const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRybnZpYmdqamNhaGVnamp4b2F6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0MzUyOTMsImV4cCI6MjA5NzAxMTI5M30.rBtiOuDWpnQm0DJgvzLISKVvFTNnVeW-Nip60cuuSag'
