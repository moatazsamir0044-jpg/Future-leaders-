import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'

// Landing point for the links Supabase emails out (password recovery today,
// invites or magic links later). The link is single-use and arrives in one of
// two shapes depending on how the project's email templates are written, so
// both are handled here rather than in the pages that follow.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type')

  // Only ever redirect within this app: `next` comes from a URL the user
  // clicked in an email, so an absolute value would make this an open redirect.
  const requested = searchParams.get('next') ?? '/reset-password'
  const next = requested.startsWith('/') && !requested.startsWith('//')
    ? requested
    : '/reset-password'

  const supabase = await createClient()

  // PKCE flow: the verifier was stored in a cookie when the mail was
  // requested, so this only succeeds in the browser that asked for the link.
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    )
  }

  // Older template style: `{{ .TokenHash }}` verified directly.
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type: type as 'recovery' | 'invite' | 'magiclink' | 'email',
      token_hash: tokenHash,
    })
    if (!error) return NextResponse.redirect(new URL(next, origin))
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error.message)}`, origin),
    )
  }

  return NextResponse.redirect(
    new URL('/login?error=That+link+is+invalid+or+has+expired.', origin),
  )
}
