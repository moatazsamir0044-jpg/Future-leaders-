import type { Metadata } from 'next'
import './globals.css'

// Minimal placeholder shell so `next build` succeeds for this
// backend/schema/import-parser phase. The real dashboard shell — design
// tokens, bilingual Arabic RTL / English LTR switching, sidebar/topbar — is
// built in the UI phase (see the plan's §6-8), not here.
export const metadata: Metadata = {
  title: 'PLPM Viewer',
  description: 'Payroll import and search — under construction',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full bg-gray-50 antialiased">{children}</body>
    </html>
  )
}
