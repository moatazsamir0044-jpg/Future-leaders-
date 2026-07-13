import { createClient } from '@/lib/supabase/server'
import { CustodyManager } from '@/components/finance/custody-manager'
import type { CustodyAccount, CustodyTransaction } from '@/types'

export default async function CustodyPage() {
  const supabase = await createClient()

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from('custody_accounts').select('*').order('created_at'),
    supabase.from('custody_transactions')
      .select('*, account:custody_accounts(id, name)')
      .order('txn_date', { ascending: false })
      .order('created_at', { ascending: false }),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Cash Custody — العُهد</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Floats like the InstaPay emergency custody and vehicle spending — top-ups in, expenses out, reconciled monthly.
        </p>
      </div>

      <CustodyManager
        accounts={(accounts ?? []) as CustodyAccount[]}
        transactions={(transactions ?? []) as CustodyTransaction[]}
      />
    </div>
  )
}
