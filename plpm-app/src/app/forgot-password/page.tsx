'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useState } from 'react'
import {
  AuthShell,
  AuthError,
  AuthNotice,
  authButtonClass,
  authFieldClass,
} from '@/components/auth/auth-shell'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Derived from the current origin rather than a build-time constant, so
      // preview deployments send links back to themselves. Every origin used
      // must be listed under Redirect URLs in Supabase → Authentication.
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
    } else {
      // Shown whether or not the address has an account: telling the two apart
      // would let anyone check who is registered.
      setSent(true)
    }
  }

  return (
    <AuthShell heading="Reset your password">
      {sent ? (
        <div className="space-y-4">
          <AuthNotice>
            If an account exists for {email}, a reset link is on its way. The link
            expires in one hour and can only be used once.
          </AuthNotice>
          <Link href="/login" className="block text-center text-sm text-blue-300 hover:text-blue-200">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-blue-100/70 text-sm">
            Enter the email address you sign in with and we&apos;ll send you a link
            to choose a new password.
          </p>
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
          {error && <AuthError>{error}</AuthError>}
          <button type="submit" disabled={loading} className={authButtonClass}>
            {loading ? 'Sending…' : 'Send reset link'}
          </button>
          <Link href="/login" className="block text-center text-sm text-blue-300 hover:text-blue-200 pt-1">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  )
}
