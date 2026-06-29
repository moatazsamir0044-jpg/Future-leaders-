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
  await supabase.auth.getUser()

  return supabaseResponse
}

export const config = {
  matcher: [
    // Run on all paths except static assets and image files.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
