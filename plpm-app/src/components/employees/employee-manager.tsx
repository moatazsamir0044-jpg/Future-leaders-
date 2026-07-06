'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, Trash2, UserCheck, UserX } from 'lucide-react'
import type { Employee, Site } from '@/types'

type FormData = {
  site_id: string
  worker_number: string
  name: string
  base_monthly_salary: string
  daily_wage: string
  insurance_enrolled: boolean
}

const emptyForm = (): FormData => ({
  site_id: '', worker_number: '', name: '',
  base_monthly_salary: '0', daily_wage: '0', insurance_enrolled: false,
})

function employeeToForm(e: Employee): FormData {
  return {
    site_id: e.site_id,
    worker_number: String(e.worker_number),
    name: e.name,
    base_monthly_salary: String(e.base_monthly_salary),
    daily_wage: String(e.daily_wage),
    insurance_enrolled: e.insurance_enrolled,
  }
}

export function EmployeeManager({ employees: initial, sites }: { employees: Employee[]; sites: Site[] }) {
  const [employees, setEmployees] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Employee | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [filterSite, setFilterSite] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null)
  const [deleting, setDeleting] = useState(false)
  const toast = useToast()

  function openNew() { setEditing(null); setForm(emptyForm()); setError(''); setOpen(true) }
  function openEdit(e: Employee) { setEditing(e); setForm(employeeToForm(e)); setError(''); setOpen(true) }

  function setF(key: keyof FormData, value: string | boolean) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    if (!form.site_id) { setError('Site is required'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      site_id: form.site_id,
      worker_number: parseInt(form.worker_number) || null,
      name: form.name.trim(),
      base_monthly_salary: parseFloat(form.base_monthly_salary) || 0,
      daily_wage: parseFloat(form.daily_wage) || 0,
      insurance_enrolled: form.insurance_enrolled,
      active: true,
    }
    let result
    if (editing) {
      result = await supabase.from('employees').update(payload).eq('id', editing.id).select('*, site:sites(id, name, service_type)').single()
    } else {
      result = await supabase.from('employees').insert(payload).select('*, site:sites(id, name, service_type)').single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }
    const updated = editing
      ? employees.map(e => e.id === editing.id ? result.data : e)
      : [...employees, result.data]
    setEmployees(updated as Employee[])
    toast(editing ? `Updated ${form.name.trim()}` : `Added ${form.name.trim()} to the roster`)
    setSaving(false); setOpen(false)
  }

  async function handleToggleActive(e: Employee) {
    const supabase = createClient()
    const { error: err } = await supabase.from('employees').update({ active: !e.active }).eq('id', e.id)
    if (err) { toast(`Could not update ${e.name}: ${err.message}`, 'error'); return }
    setEmployees(prev => prev.map(x => x.id === e.id ? { ...x, active: !x.active } : x))
    toast(e.active ? `${e.name} deactivated — they will no longer be prefilled into new payroll sheets` : `${e.name} activated`)
  }

  async function handleDelete(e: Employee) {
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('employees').delete().eq('id', e.id)
    setDeleting(false)
    setDeleteTarget(null)
    if (err) { toast(`Could not delete ${e.name}: ${err.message}`, 'error'); return }
    setEmployees(prev => prev.filter(x => x.id !== e.id))
    toast(`Deleted ${e.name}`)
  }

  const filtered = filterSite ? employees.filter(e => e.site_id === filterSite) : employees

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
        <select
          value={filterSite}
          onChange={e => setFilterSite(e.target.value)}
          className="h-8 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Sites</option>
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Employee</Button>
      </div>

      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="bg-gray-50/70 border-b border-gray-100">
            <th className="text-left px-4 py-3 font-medium text-gray-600 w-10">#</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Name</th>
            <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Salary</th>
            <th className="text-right px-4 py-3 font-medium text-gray-600">Daily</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">Insurance</th>
            <th className="text-center px-4 py-3 font-medium text-gray-600">Status</th>
            <th className="px-3 py-3 w-20" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {filtered.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                {filterSite
                  ? 'No employees for this site. Change the filter or use "Add Employee" above.'
                  : 'No employees yet. Use "Add Employee" above to build the roster — new payroll sheets can then be prefilled automatically.'}
              </td>
            </tr>
          ) : filtered.map(e => {
            const site = e.site as { name: string; service_type: string } | undefined
            return (
              <tr key={e.id} className={`hover:bg-gray-50/50 ${!e.active ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3 text-gray-500 text-xs">{e.worker_number}</td>
                <td className="px-4 py-3 font-medium text-gray-900" dir="rtl">{e.name}</td>
                <td className="px-4 py-3 text-gray-600 text-xs">
                  {site?.name}
                  <span className="ml-1 text-xs bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded uppercase">{site?.service_type}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(e.base_monthly_salary)}</td>
                <td className="px-4 py-3 text-right font-mono text-gray-600 text-xs">{formatCurrency(e.daily_wage)}</td>
                <td className="px-4 py-3 text-center">
                  {e.insurance_enrolled
                    ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Yes</span>
                    : <span className="text-xs text-gray-400">No</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {e.active
                    ? <span className="text-xs bg-green-50 text-green-700 px-2 py-0.5 rounded">Active</span>
                    : <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Inactive</span>}
                </td>
                <td className="px-3 py-3">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => openEdit(e)} className="text-gray-400 hover:text-blue-600 p-1 rounded" title="Edit" aria-label={`Edit ${e.name}`}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => handleToggleActive(e)} className="text-gray-400 hover:text-amber-600 p-1 rounded" title={e.active ? 'Deactivate' : 'Activate'} aria-label={e.active ? `Deactivate ${e.name}` : `Activate ${e.name}`}>
                      {e.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setDeleteTarget(e)} className="text-gray-400 hover:text-red-600 p-1 rounded" title="Delete" aria-label={`Delete ${e.name}`}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Employee"
        message={<>Delete <strong dir="rtl">{deleteTarget?.name}</strong> from the roster? This cannot be undone. If they simply left, consider deactivating them instead so past payroll stays linked.</>}
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Employee' : 'Add Employee'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Site *</label>
              <select value={form.site_id} onChange={e => setF('site_id', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select site…</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Worker #</label>
              <input type="number" value={form.worker_number} onChange={e => setF('worker_number', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name (Arabic) *</label>
            <input type="text" value={form.name} onChange={e => setF('name', e.target.value)} dir="rtl"
              placeholder="اسم الموظف"
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Salary (EGP)</label>
              <input type="number" step="0.01" value={form.base_monthly_salary} onChange={e => setF('base_monthly_salary', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Daily Wage (EGP)</label>
              <input type="number" step="0.01" value={form.daily_wage} onChange={e => setF('daily_wage', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.insurance_enrolled} onChange={e => setF('insurance_enrolled', e.target.checked)}
              className="rounded border-gray-300 text-blue-600" />
            <span className="text-sm text-gray-700">Enrolled in social insurance</span>
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Add Employee'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
