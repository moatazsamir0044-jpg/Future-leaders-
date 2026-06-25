import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PayrollTable } from '@/components/payroll/payroll-table'
import { PayrollActions } from '@/components/payroll/payroll-actions'

export default async function PayrollDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: period }, { data: records }] = await Promise.all([
    supabase.from('payroll_periods')
      .select('*, site:sites(*)')
      .eq('id', id)
      .single(),
    supabase.from('payroll_records')
      .select('*')
      .eq('period_id', id)
      .order('worker_number'),
  ])

  if (!period) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('user_profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const site = period.site as { name: string; name_ar?: string; service_type: string; client_name?: string }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{site?.name}</h1>
            <StatusBadge status={period.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {formatMonthYear(period.month, period.year)} · {site?.service_type?.toUpperCase()} · {site?.client_name ?? ''}
          </p>
        </div>
        <PayrollActions period={period} records={records ?? []} site={period.site as never} role={profile?.role ?? 'finance'} />
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Employees', value: String(records?.length ?? 0) },
          { label: 'Gross Total', value: `EGP ${formatCurrency(period.total_gross)}` },
          { label: 'Net Total', value: `EGP ${formatCurrency(period.total_net)}` },
          { label: 'Deductions', value: `EGP ${formatCurrency((records ?? []).reduce((s, r) => s + Number(r.deductions ?? 0) + Number(r.insurance ?? 0) + Number(r.penalties ?? 0), 0))}` },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
          </Card>
        ))}
      </div>

      {/* Rejection notes */}
      {period.status === 'rejected' && period.rejection_notes && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Rejected:</strong> {period.rejection_notes}
        </div>
      )}

      {/* Payroll table */}
      <Card>
        <CardHeader>
          <CardTitle>Employee Payroll Records</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <PayrollTable
            periodId={id}
            records={records ?? []}
            periodStatus={period.status}
            siteId={period.site_id}
          />
        </CardContent>
      </Card>
    </div>
  )
}
