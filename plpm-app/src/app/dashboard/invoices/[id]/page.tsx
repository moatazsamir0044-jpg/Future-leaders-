import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { formatMonthYear } from '@/lib/utils'
import { InvoiceEditor } from '@/components/finance/invoice-editor'
import { InvoiceStatusBadge } from '@/components/finance/invoice-status-badge'
import { ArrowLeft } from 'lucide-react'
import type { Invoice, InvoiceDeduction } from '@/types'

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const [{ data: invoice }, { data: deductions }] = await Promise.all([
    supabase.from('invoices')
      .select('*, contract:contracts(*, client:clients(id, name, name_ar), contract_sites(site_id, site:sites(id, name)))')
      .eq('id', id).single(),
    supabase.from('invoice_deductions').select('*').eq('invoice_id', id).order('sort_order'),
  ])

  if (!invoice) notFound()
  const inv = invoice as Invoice

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <Link href={`/dashboard/invoices?month=${inv.month}&year=${inv.year}`}
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-1">
            <ArrowLeft className="h-3.5 w-3.5" /> Invoices
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold text-gray-900">{inv.contract?.name ?? 'Invoice'}</h1>
            <InvoiceStatusBadge status={inv.status} />
            {inv.is_extra_works && (
              <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded font-medium">Extra works</span>
            )}
          </div>
          <p className="text-sm text-gray-500 mt-0.5">
            {inv.contract?.client?.name} · {formatMonthYear(inv.month, inv.year)}
            {(inv.contract?.contract_sites ?? []).length > 0 && (
              <> · Sites: {(inv.contract?.contract_sites ?? []).map(cs => cs.site?.name).filter(Boolean).join(', ')}</>
            )}
          </p>
        </div>
      </div>

      <InvoiceEditor invoice={inv} deductions={(deductions ?? []) as InvoiceDeduction[]} />
    </div>
  )
}
