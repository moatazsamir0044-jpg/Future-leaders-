'use client'

import { useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LocaleToggle } from '@/components/i18n/locale-toggle'

export function LoginForm() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setIsSubmitting(false)
      setError(
        signInError.status === 400 ? t('auth.invalidCredentials') : t('auth.genericError'),
      )
      return
    }

    const next = searchParams.get('next') ?? '/dashboard'
    router.push(next)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-muted/30 p-4">
      <div className="absolute top-4 end-4">
        <LocaleToggle />
      </div>
      <Card className="w-full max-w-sm shadow-sm">
        <CardHeader className="gap-1">
          <CardTitle className="text-xl">{t('auth.signInTitle')}</CardTitle>
          <CardDescription>{t('auth.signInSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                dir="ltr"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t('auth.password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                dir="ltr"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={isSubmitting} className="mt-2">
              {isSubmitting ? t('auth.signingIn') : t('auth.signInButton')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">{t('auth.noAccount')}</p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
