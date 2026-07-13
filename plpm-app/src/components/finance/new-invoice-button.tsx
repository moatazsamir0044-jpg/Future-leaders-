'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { Plus } from 'lucide-react'
import type { Contract } from '@/types'

export function NewInvoiceButton({ contracts, month, year, existingContractIds }: {
  contracts: Contract[]
  month: number
  year: number
  existingContractIds: string[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [contractId, setContractId] = useState('')
  const [isExtraWorks, setIsExtraWorks] = useState(false)
  const [gross, setGross] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selected = contracts.find(c => c.id === contractId)
  // A contract that already has its regular monthly invoice can only get an extra-works one
  const alreadyInvoiced = selected != null && existingContractIds.includes(selected.id)

  function openModal() {
    setContractId(''); setIsExtraWorks(false); setGross(''); setError(''); setOpen(true)
  }

  function pickContract(id: string) {
    setContractId(id)
    const c = contracts.find(x => x.id === id)
    if (c && !isExtraWorks) setGross(String(c.monthly_value ?? ''))
    if (c && existingContractIds.includes(id)) setIsExtraWorks(true)
  }

  async function handleCreate() {
    if (!contractId) { setError('Select a contract'); return }
    const grossNum = parseFloat(gross)
    if (!Number.isFinite(grossNum) || grossNum < 0) { setError('Enter a valid gross amount'); return }
    if (alreadyInvoiced && !isExtraWorks) { setError('This contract already has its monthly invoice — mark this one as extra works'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.from('invoices').insert({
      contract_id: contractId,
      month, year,
      is_extra_works: isExtraWorks,
      gross_amount: grossNum,
      net_amount: grossNum,
      status: 'draft',
    }).select('id').single()
    if (err) {
      setError(err.code === '23505'
        ? 'This contract already has an invoice for this month.'
        : err.message)
      setSaving(false)
      return
    }
    router.push(`/dashboard/invoices/${data.id}`)
  }

  return (
    <>
      <Button onClick={openModal} disabled={contracts.length === 0}
        title={contracts.length === 0 ? 'Add a contract first under Clients & Contracts' : undefined}>
        <Plus className="h-4 w-4" /> New Invoice
      </Button>

      <Modal open={open} onClose={() => setOpen(false)} title={`New Invoice — ${formatMonthYear(month, year)}`} size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Contract *</label>
            <select value={contractId} onChange={e => pickContract(e.target.value)}
              className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Select contract…</option>
              {contracts.map(c => (
                <option key={c.id} value={c.id}>
                  {c.client?.name ? `${c.client.name} — ` : ''}{c.name}
                  {existingContractIds.includes(c.id) ? ' (monthly invoice exists)' : ''}
                </option>
              ))}
            </select>
            {selected && (
              <p className="text-xs text-gray-400 mt-1">Contract monthly value: EGP {formatCurrency(selected.monthly_value)}</p>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Gross Amount (EGP) *</label>
            <input type="number" min="0" value={gross} onChange={e => setGross(e.target.value)}
              className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">Deductions agreed in the monthly meeting are added on the invoice page.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input type="checkbox" checked={isExtraWorks} onChange={e => setIsExtraWorks(e.target.checked)}
              disabled={alreadyInvoiced}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
            Extra works (separate from the monthly contract invoice)
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={saving}>Create Invoice</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
