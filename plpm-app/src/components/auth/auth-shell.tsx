// The branded frame shared by every signed-out screen (sign in, forgot
// password, reset password) so they stay visually identical as they change.
export function AuthShell({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-white/10 rounded-2xl mb-4 backdrop-blur-sm border border-white/20">
            <span className="text-white font-black text-xl tracking-tight">PL</span>
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Professional Leaders</h1>
          <p className="text-blue-300/80 text-sm mt-1">Facility Management System</p>
        </div>

        <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
          <h2 className="text-lg font-semibold text-white mb-6">{heading}</h2>
          {children}
        </div>
        <p className="text-center text-white/30 text-xs mt-6">© 2026 Professional Leaders. All rights reserved.</p>
      </div>
    </div>
  )
}

export const authFieldClass =
  'w-full h-10 rounded-lg bg-white/10 border border-white/20 text-white placeholder:text-white/40 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent'

export const authButtonClass =
  'w-full h-11 bg-blue-500 hover:bg-blue-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold rounded-lg transition-colors text-sm mt-2'

export function AuthError({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-red-500/20 border border-red-400/40 text-red-200 text-sm px-3 py-2 rounded-lg">
      {children}
    </div>
  )
}

export function AuthNotice({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-emerald-500/20 border border-emerald-400/40 text-emerald-100 text-sm px-3 py-2 rounded-lg">
      {children}
    </div>
  )
}
