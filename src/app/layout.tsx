import type { Metadata } from 'next'
import { Inter, Noto_Kufi_Arabic } from 'next/font/google'
import { cookies } from 'next/headers'
import './globals.css'
import { cn } from '@/lib/utils'
import { DEFAULT_LOCALE, LOCALE_COOKIE_NAME, directionForLocale, isLocale } from '@/lib/i18n/config'
import { getDictionary } from '@/lib/i18n/get-dictionary'
import { I18nProvider } from '@/components/i18n/i18n-provider'
import { Toaster } from '@/components/ui/sonner'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })
const notoKufiArabic = Noto_Kufi_Arabic({ subsets: ['arabic'], variable: '--font-arabic' })

export const metadata: Metadata = {
  title: 'PLPM Viewer',
  description: 'Payroll import and search',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Locale is read from a cookie SERVER-SIDE, here, so `<html lang dir>` is
  // correct on first paint — no flash of the wrong text direction. See
  // src/lib/i18n/config.ts and src/lib/i18n/actions.ts.
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get(LOCALE_COOKIE_NAME)?.value
  const locale = isLocale(cookieLocale) ? cookieLocale : DEFAULT_LOCALE
  const dictionary = getDictionary(locale)
  const dir = directionForLocale(locale)

  return (
    <html
      lang={locale}
      dir={dir}
      className={cn('h-full', inter.variable, notoKufiArabic.variable)}
      suppressHydrationWarning
    >
      <body className="min-h-full bg-background text-foreground antialiased">
        <I18nProvider locale={locale} dictionary={dictionary}>
          {children}
          <Toaster position="top-center" richColors closeButton />
        </I18nProvider>
      </body>
    </html>
  )
}
