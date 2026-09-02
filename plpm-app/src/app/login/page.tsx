'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense, useState } from 'react'
import {
  AuthShell,
  AuthError,
  authButtonClass,
  authFieldClass,
} from '@/components/auth/auth-shell'

function LoginForm() {
  const router = useRouter()
  // /auth/callback sends a failed or expired email link back here with the
  // reason, so a dead link explains itself instead of showing a bare form.
  const linkError = useSearchParams().get('error') ?? ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleLogin} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-blue-100 mb-1">Email address</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          placeholder="you@professionalleaders.co"
          className={authFieldClass}
        />
      </div>
      <div>
        <div className="flex items-baseline justify-between mb-1">
          <label className="block text-sm font-medium text-blue-100">Password</label>
          <Link href="/forgot-password" className="text-xs text-blue-300 hover:text-blue-200">
            Forgot password?
          </Link>
        </div>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          placeholder="••••••••"
          className={authFieldClass}
        />
      </div>
      {(error || linkError) && <AuthError>{error || linkError}</AuthError>}
      <button type="submit" disabled={loading} className={authButtonClass}>
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthShell heading="Sign in to your account">
      {/* useSearchParams opts the subtree into client-side rendering, which
          Next requires a Suspense boundary for during prerendering. */}
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </AuthShell>
  )
}
