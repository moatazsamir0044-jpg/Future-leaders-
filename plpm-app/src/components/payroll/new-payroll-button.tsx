'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/ui/modal'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { Plus } from 'lucide-react'
import type { Site } from '@/types'

export function NewPayrollButton({ sites, month, year }: { sites: Site[]; month: number; year: number }) {
  const [open, setOpen] = useState(false)
  const [siteId, setSiteId] = useState('')
  const [prefill, setPrefill] = useState(true)
  const [rosterCount, setRosterCount] = useState<number | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const toast = useToast()

  async function handleSiteChange(id: string) {
    setSiteId(id)
    setError('')
    setRosterCount(null)
    if (!id) return
    const supabase = createClient()
    const { count } = await supabase
      .from('employees')
      .select('id', { count: 'exact', head: true })
      .eq('site_id', id)
      .eq('active', true)
    setRosterCount(count ?? 0)
  }

  async function handleCreate() {
    if (!siteId) return
    setError('')
    setLoading(true)
    const supabase = createClient()
    const { data, error: err } = await supabase
      .from('payroll_periods')
      .insert({ site_id: siteId, month, year, status: 'draft' })
      .select()
      .single()
    if (err) {
      setLoading(false)
      setError(err.code === '23505' ? 'A payroll sheet already exists for this site and month.' : err.message)
      return
    }

    if (prefill && (rosterCount ?? 0) > 0) {
      const { data: employees, error: rosterErr } = await supabase
        .from('employees')
        .select('*')
        .eq('site_id', siteId)
        .eq('active', true)
        .order('worker_number')

      if (rosterErr || !employees) {
        setLoading(false)
        setCreatedId(data.id)
        setError(`Sheet created, but the roster could not be loaded: ${rosterErr?.message ?? 'unknown error'}. Open the sheet and add employees manually.`)
        return
      }

      const rows = employees.map(emp => ({
        period_id: data.id,
        site_id: siteId,
        employee_id: emp.id,
        worker_number: emp.worker_number,
        employee_name: emp.name,
        base_monthly_salary: emp.base_monthly_salary,
        daily_wage: emp.daily_wage,
      }))
      const { error: insertErr } = await supabase.from('payroll_records').insert(rows)
      if (insertErr) {
        setLoading(false)
        setCreatedId(data.id)
        setError(`Sheet created, but employees could not be prefilled: ${insertErr.message}. Open the sheet and add them manually.`)
        return
      }
    }

    setLoading(false)
    setOpen(false)
    toast(prefill && (rosterCount ?? 0) > 0
      ? `Payroll sheet created with ${rosterCount} employee${rosterCount === 1 ? '' : 's'} from the roster`
      : 'Payroll sheet created')
    router.push(`/dashboard/payroll/${data.id}`)
  }

  function handleClose() {
    setOpen(false)
    setError('')
    setCreatedId(null)
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="md">
        <Plus className="h-4 w-4" /> New Payroll Sheet
      </Button>
      <Modal open={open} onClose={handleClose} title="New Payroll Sheet" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Select site</label>
            <select
              value={siteId}
              onChange={e => handleSiteChange(e.target.value)}
              disabled={createdId !== null}
              className="w-full h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
            >
              <option value="">Choose a site…</option>
              {sites.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.service_type.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          {siteId && createdId === null && (
            <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={prefill}
                onChange={e => setPrefill(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span>
                Prefill with active employees from the roster
                {rosterCount !== null && (
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {rosterCount === 0
                      ? 'This site has no active employees — the sheet will start empty.'
                      : `${rosterCount} employee${rosterCount === 1 ? '' : 's'} will be added with their name, number, salary and daily wage.`}
                  </span>
                )}
              </span>
            </label>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            {createdId ? (
              <Button onClick={() => { handleClose(); router.push(`/dashboard/payroll/${createdId}`) }}>Open Sheet</Button>
            ) : (
              <Button onClick={handleCreate} loading={loading} disabled={!siteId}>Create</Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
