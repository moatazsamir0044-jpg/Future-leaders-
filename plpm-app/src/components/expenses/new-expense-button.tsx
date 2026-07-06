'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Plus } from 'lucide-react'
import type { Site } from '@/types'

export function NewExpenseButton({ sites, month, year }: { sites: Site[]; month: number; year: number }) {
  const [open, setOpen] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const toast = useToast()

  async function handleCreate() {
    if (!siteId) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('expense_reports')
      .insert({ site_id: siteId, month, year, status: 'draft' })
      .select()
      .single()
    setLoading(false)
    if (err) {
      setError(err.code === '23505' ? 'An expense report already exists for this site and month.' : err.message)
    } else {
      setOpen(false)
      toast('Expense report created')
      router.push(`/dashboard/expenses/${data.id}`)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="md">
        <Plus className="h-4 w-4" /> New Expense Report
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="New Expense Report" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select site</label>
            <select
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="">Choose a site…</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.service_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} loading={loading} disabled={!siteId}>Create</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
