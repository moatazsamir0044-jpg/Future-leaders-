// Supabase connection values.
//
// The anon key is designed to ship in the browser bundle — the database is
// protected by Row-Level Security, not by keeping this key secret. It is still
// read from the environment rather than hard-coded, so that staging and
// production can point at different projects and a leaked key can be rotated
// without a code change.
// NEXT_PUBLIC_* values are inlined at build time, not read at runtime, so this
// fires during `next build` rather than on the first request. That is the point:
// a deployment that would have started against no database fails in CI instead.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local for local work, or set ` +
        `it in your hosting provider BEFORE the build — NEXT_PUBLIC_* variables are ` +
        `baked into the bundle at build time. Values are in Supabase → Project ` +
        `Settings → API.`,
    )
  }
  return value
}

export const SUPABASE_URL = required(
  'NEXT_PUBLIC_SUPABASE_URL',
  process.env.NEXT_PUBLIC_SUPABASE_URL,
)

export const SUPABASE_ANON_KEY = required(
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
)
