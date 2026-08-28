// Supabase connection values.
//
// The anon key is designed to ship in the browser bundle — the database is
// protected by Row-Level Security, not by keeping this key secret. It is still
// read from the environment rather than hard-coded, so that staging and
// production can point at different projects and a leaked key can be rotated
// without a code change.
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `${name} is not set. Copy .env.example to .env.local (or set it in your ` +
        `hosting provider) with the values from your Supabase project settings.`,
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
