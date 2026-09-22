import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/config'

// Next.js 16 renamed the `middleware` convention to `proxy`. This runs on
// every matched request and refreshes the Supabase auth session so that
// Server Components always receive a valid (non-expired) access token.
// Without it, an expired JWT reaches PostgREST, RLS treats the request as
// anonymous, and every query silently returns zero rows.
export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  // IMPORTANT: refreshes the session and writes rotated tokens back to the
  // response cookies. Do not run any code between client creation and this call.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // RLS is authenticated-only (no anonymous read policy anywhere), so an
  // unauthenticated visitor to /dashboard/** would just see empty data with
  // no explanation — redirect to /login instead. This is defense in depth
  // alongside the per-layout check in src/app/dashboard/layout.tsx, not a
  // replacement for it (see that Next.js data-security guidance: verify
  // auth in the route itself, don't rely on proxy alone).
  if (!user && pathname.startsWith('/dashboard')) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Already signed in — no reason to show the login form again.
  if (user && pathname === '/login') {
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
