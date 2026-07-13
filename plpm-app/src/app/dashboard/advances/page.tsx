import { createClient } from '@/lib/supabase/server'
import { Card } from '@/components/ui/card'
import { AdvanceManager } from '@/components/finance/advance-manager'
import { advanceBalance, advanceDueInstallment } from '@/lib/advances'
import { formatCurrency } from '@/lib/utils'
import type { WorkerAdvance } from '@/types'

export default async function AdvancesPage() {
  const supabase = await createClient()

  const [{ data: advances }, { data: sites }] = await Promise.all([
    supabase.from('worker_advances')
      .select('*, employee:employees(id, name, worker_number, site:sites(id, name)), repayments:advance_repayments(*)')
      .order('created_at', { ascending: false }),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  const list = (advances ?? []) as WorkerAdvance[]
  const active = list.filter(a => a.status === 'active')
  const totalOutstanding = active.reduce((s, a) => s + advanceBalance(a), 0)
  const dueNextPayroll = active.reduce((s, a) => s + advanceDueInstallment(a), 0)

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Worker Advances — السلف</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Balances tracked across months. Approving a payroll sheet records its advance deductions here automatically.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Active Advances', value: String(active.length), color: 'text-blue-600' },
          { label: 'Outstanding Balance', value: `EGP ${formatCurrency(totalOutstanding)}`, color: 'text-gray-900' },
          { label: 'Due Next Payroll', value: `EGP ${formatCurrency(dueNextPayroll)}`, color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <AdvanceManager advances={list} sites={sites ?? []} />
    </div>
  )
}
