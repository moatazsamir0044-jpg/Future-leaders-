import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PayrollImporter } from '@/components/payroll/payroll-importer'
import { ArrowLeft } from 'lucide-react'

export default async function ImportPayrollPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('user_profiles').select('role').eq('id', user.id).single()
    : { data: null }
  if (profile?.role !== 'admin') redirect('/dashboard/payroll')

  const { data: sites } = await supabase
    .from('sites')
    .select('id, name, sheet_key')
    .eq('active', true)
    .order('name')

  return (
    <div className="p-6 space-y-6">
      <div>
        <Link href="/dashboard/payroll" prefetch={false}
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
          <ArrowLeft className="h-4 w-4" /> Back to Payroll
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Import a payroll month</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Upload the monthly payroll workbooks and the system reads them in — one worksheet per site.
        </p>
      </div>

      <PayrollImporter sites={sites ?? []} />
    </div>
  )
}
