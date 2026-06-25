import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { StatusBadge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ExpenseTables } from '@/components/expenses/expense-tables'
import { ExpenseActions } from '@/components/expenses/expense-actions'

export default async function ExpenseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [
    { data: report },
    { data: transportation },
    { data: accommodation },
    { data: items },
  ] = await Promise.all([
    supabase.from('expense_reports').select('*, site:sites(*)').eq('id', id).single(),
    supabase.from('expense_transportation').select('*').eq('report_id', id).order('sort_order'),
    supabase.from('expense_accommodation').select('*').eq('report_id', id).order('sort_order'),
    supabase.from('expense_items').select('*').eq('report_id', id).order('sort_order'),
  ])

  if (!report) notFound()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('user_profiles').select('*').eq('id', user.id).single()
    : { data: null }

  const site = report.site as { name: string; name_ar?: string; service_type: string; client_name?: string }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{site?.name}</h1>
            <StatusBadge status={report.status} />
          </div>
          <p className="text-sm text-gray-500 mt-1">
            {formatMonthYear(report.month, report.year)} · {site?.service_type?.toUpperCase()} · {site?.client_name ?? ''}
          </p>
        </div>
        <ExpenseActions
          report={report}
          transportation={transportation ?? []}
          accommodation={accommodation ?? []}
          items={items ?? []}
          site={report.site as never}
          role={profile?.role ?? 'finance'}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Transportation', value: `EGP ${formatCurrency(report.total_transportation)}` },
          { label: 'Accommodation', value: `EGP ${formatCurrency(report.total_accommodation)}` },
          { label: 'Other Expenses', value: `EGP ${formatCurrency(report.total_other)}` },
          { label: 'Grand Total', value: `EGP ${formatCurrency(report.grand_total)}` },
        ].map(({ label, value }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
          </Card>
        ))}
      </div>

      {report.status === 'rejected' && report.rejection_notes && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <strong>Rejected:</strong> {report.rejection_notes}
        </div>
      )}

      <ExpenseTables
        reportId={id}
        transportation={transportation ?? []}
        accommodation={accommodation ?? []}
        items={items ?? []}
        reportStatus={report.status}
      />
    </div>
  )
}
