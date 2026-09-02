'use client'

import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import {
  AuthShell,
  AuthError,
  authButtonClass,
  authFieldClass,
} from '@/components/auth/auth-shell'

// Supabase's own floor is 6; 8 is the shortest length that is not trivially
// guessable, and rejecting here saves a round trip.
const MIN_LENGTH = 8

export default function ResetPasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // `null` while we are still finding out — showing either the form or the
  // expired-link message before then would flash the wrong one.
  const [recovering, setRecovering] = useState<boolean | null>(null)

  useEffect(() => {
    // /auth/callback exchanged the emailed link for a session before sending
    // the user here. Without one there is nothing to update, and the browser
    // that opens the link must be the one that requested it.
    createClient()
      .auth.getUser()
      .then(({ data }) => setRecovering(Boolean(data.user)))
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirmation) {
      setError('The two passwords do not match.')
      return
    }
    if (password.length < MIN_LENGTH) {
      setError(`Use at least ${MIN_LENGTH} characters.`)
      return
    }
    setError('')
    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    // The recovery session is already a full session, so there is no second
    // sign-in step.
    router.push('/dashboard')
    router.refresh()
  }

  if (recovering === null) {
    return (
      <AuthShell heading="Choose a new password">
        <p className="text-blue-100/70 text-sm">Checking your link…</p>
      </AuthShell>
    )
  }

  if (!recovering) {
    return (
      <AuthShell heading="That link has expired">
        <div className="space-y-4">
          <AuthError>
            Reset links last one hour and work only once, in the browser that
            requested them.
          </AuthError>
          <Link
            href="/forgot-password"
            className="block text-center text-sm text-blue-300 hover:text-blue-200"
          >
            Send a new link
          </Link>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell heading="Choose a new password">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-blue-100 mb-1">New password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            placeholder="••••••••"
            className={authFieldClass}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-blue-100 mb-1">Confirm new password</label>
          <input
            type="password"
            value={confirmation}
            onChange={e => setConfirmation(e.target.value)}
            required
            minLength={MIN_LENGTH}
            autoComplete="new-password"
            placeholder="••••••••"
            className={authFieldClass}
          />
        </div>
        {error && <AuthError>{error}</AuthError>}
        <button type="submit" disabled={loading} className={authButtonClass}>
          {loading ? 'Saving…' : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  )
}
