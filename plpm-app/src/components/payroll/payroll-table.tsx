'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { PayrollRecord } from '@/types'

const FIELDS = [
  { key: 'attendance_days', label: 'Attendance', type: 'number', step: '0.5' },
  { key: 'absence_days', label: 'Absence', type: 'number', step: '0.5' },
  { key: 'net_days', label: 'Net Days', type: 'number', step: '0.01' },
  { key: 'monthly_leave_days', label: 'Monthly Leave', type: 'number', step: '0.5' },
  { key: 'annual_leave_days', label: 'Annual Leave', type: 'number', step: '0.5' },
  { key: 'absence_no_permission', label: 'Abs. No Perm.', type: 'number', step: '0.5' },
  { key: 'overtime_hours', label: 'OT Hours', type: 'number', step: '0.5' },
  { key: 'less_hours', label: 'Less Hours', type: 'number', step: '0.5' },
  { key: 'base_monthly_salary', label: 'Monthly Salary', type: 'number', step: '0.01' },
  { key: 'daily_wage', label: 'Daily Wage', type: 'number', step: '0.01' },
  { key: 'bonuses', label: 'Bonuses', type: 'number', step: '0.01' },
  { key: 'transportation_amount', label: 'Transport', type: 'number', step: '0.01' },
  { key: 'transportation_category', label: 'Transport Cat.', type: 'number', step: '0.01' },
  { key: 'advance', label: 'Advance (سلف)', type: 'number', step: '0.01' },
  { key: 'insurance', label: 'Insurance', type: 'number', step: '0.01' },
  { key: 'deductions', label: 'Deductions', type: 'number', step: '0.01' },
  { key: 'penalties', label: 'Penalties', type: 'number', step: '0.01' },
  { key: 'total_gross', label: 'Gross Total', type: 'number', step: '0.01' },
  { key: 'net_salary', label: 'Net Salary', type: 'number', step: '0.01' },
] as const

type FieldKey = typeof FIELDS[number]['key']
type FormData = { worker_number: string; employee_name: string } & Record<FieldKey, string>

const emptyForm = (): FormData => ({
  worker_number: '', employee_name: '',
  attendance_days: '0', absence_days: '0', net_days: '0',
  monthly_leave_days: '0', annual_leave_days: '0', absence_no_permission: '0',
  overtime_hours: '0', less_hours: '0',
  base_monthly_salary: '0', daily_wage: '0',
  bonuses: '0', transportation_amount: '0', transportation_category: '0',
  advance: '0', insurance: '0', deductions: '0', penalties: '0',
  total_gross: '0', net_salary: '0',
})

function recordToForm(r: PayrollRecord): FormData {
  return {
    worker_number: String(r.worker_number ?? ''),
    employee_name: r.employee_name,
    attendance_days: String(r.attendance_days),
    absence_days: String(r.absence_days),
    net_days: String(r.net_days),
    monthly_leave_days: String(r.monthly_leave_days),
    annual_leave_days: String(r.annual_leave_days),
    absence_no_permission: String(r.absence_no_permission),
    overtime_hours: String(r.overtime_hours),
    less_hours: String(r.less_hours),
    base_monthly_salary: String(r.base_monthly_salary),
    daily_wage: String(r.daily_wage),
    bonuses: String(r.bonuses),
    transportation_amount: String(r.transportation_amount),
    transportation_category: String(r.transportation_category),
    advance: String(r.advance),
    insurance: String(r.insurance),
    deductions: String(r.deductions),
    penalties: String(r.penalties),
    total_gross: String(r.total_gross),
    net_salary: String(r.net_salary),
  }
}

export function PayrollTable({ periodId, records: initialRecords, periodStatus, siteId }: {
  periodId: string
  records: PayrollRecord[]
  periodStatus: string
  siteId: string
}) {
  const [records, setRecords] = useState(initialRecords)
  const [modalOpen, setModalOpen] = useState(false)
  const [editRecord, setEditRecord] = useState<PayrollRecord | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [, startTransition] = useTransition()
  const router = useRouter()
  const canEdit = periodStatus === 'draft' || periodStatus === 'rejected'

  function openNew() {
    setEditRecord(null)
    setForm(emptyForm())
    setError('')
    setModalOpen(true)
  }

  function openEdit(r: PayrollRecord) {
    setEditRecord(r)
    setForm(recordToForm(r))
    setError('')
    setModalOpen(true)
  }

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.employee_name.trim()) { setError('Employee name is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const payload = {
      period_id: periodId,
      site_id: siteId,
      worker_number: form.worker_number ? parseInt(form.worker_number) : null,
      employee_name: form.employee_name.trim(),
      ...Object.fromEntries(FIELDS.map(f => [f.key, parseFloat(form[f.key]) || 0])),
    }
    let result
    if (editRecord) {
      result = await supabase.from('payroll_records').update(payload).eq('id', editRecord.id).select().single()
    } else {
      result = await supabase.from('payroll_records').insert(payload).select().single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }

    // Recalculate totals
    const updated = editRecord
      ? records.map(r => r.id === editRecord.id ? result.data : r)
      : [...records, result.data]
    setRecords(updated)
    const totalGross = updated.reduce((s: number, r: PayrollRecord) => s + Number(r.total_gross), 0)
    const totalNet = updated.reduce((s: number, r: PayrollRecord) => s + Number(r.net_salary), 0)
    await supabase.from('payroll_periods').update({ total_gross: totalGross, total_net: totalNet }).eq('id', periodId)

    setSaving(false)
    setModalOpen(false)
    startTransition(() => router.refresh())
  }

  async function handleDelete(r: PayrollRecord) {
    if (!confirm(`Delete record for ${r.employee_name}?`)) return
    const supabase = createClient()
    await supabase.from('payroll_records').delete().eq('id', r.id)
    const updated = records.filter(rec => rec.id !== r.id)
    setRecords(updated)
    const totalGross = updated.reduce((s: number, rec: PayrollRecord) => s + Number(rec.total_gross), 0)
    const totalNet = updated.reduce((s: number, rec: PayrollRecord) => s + Number(rec.net_salary), 0)
    await supabase.from('payroll_periods').update({ total_gross: totalGross, total_net: totalNet }).eq('id', periodId)
    startTransition(() => router.refresh())
  }

  const totalGross = records.reduce((s, r) => s + Number(r.total_gross), 0)
  const totalNet = records.reduce((s, r) => s + Number(r.net_salary), 0)

  return (
    <>
      {canEdit && (
        <div className="px-4 py-3 border-b border-gray-100 flex justify-end">
          <Button size="sm" onClick={openNew}>
            <Plus className="h-3.5 w-3.5" /> Add Employee
          </Button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[1200px]">
          <thead>
            <tr className="bg-gray-50/70 border-b border-gray-100">
              <th className="text-left px-4 py-3 font-medium text-gray-600 w-10">#</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 min-w-[160px]">Name</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Attend.</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Net Days</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">M. Salary</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Bonuses</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Transport</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Advance</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Insurance</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600">Deduct.</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600 text-blue-700">Gross</th>
              <th className="text-right px-3 py-3 font-medium text-gray-600 text-green-700">Net</th>
              {canEdit && <th className="px-3 py-3 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {records.length === 0 ? (
              <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">No employees yet. Click "Add Employee" to start.</td></tr>
            ) : records.map((r, i) => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-3 text-gray-500 text-xs">{r.worker_number ?? i + 1}</td>
                <td className="px-4 py-3 font-medium text-gray-900" dir="rtl">{r.employee_name}</td>
                <td className="px-3 py-3 text-right text-gray-700">{r.attendance_days}</td>
                <td className="px-3 py-3 text-right text-gray-700">{r.net_days}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-700">{formatCurrency(r.base_monthly_salary)}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-700">{formatCurrency(r.bonuses)}</td>
                <td className="px-3 py-3 text-right font-mono text-gray-700">{formatCurrency(r.transportation_amount)}</td>
                <td className="px-3 py-3 text-right font-mono text-red-600">{r.advance > 0 ? formatCurrency(r.advance) : '—'}</td>
                <td className="px-3 py-3 text-right font-mono text-red-600">{r.insurance > 0 ? formatCurrency(r.insurance) : '—'}</td>
                <td className="px-3 py-3 text-right font-mono text-red-600">{r.deductions > 0 ? formatCurrency(r.deductions) : '—'}</td>
                <td className="px-3 py-3 text-right font-mono font-medium text-blue-700">{formatCurrency(r.total_gross)}</td>
                <td className="px-3 py-3 text-right font-mono font-bold text-green-700">{formatCurrency(r.net_salary)}</td>
                {canEdit && (
                  <td className="px-3 py-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1 rounded transition-colors">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {records.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={10} className="px-4 py-3 text-gray-700">TOTAL ({records.length} employees)</td>
                <td className="px-3 py-3 text-right font-mono text-blue-700">{formatCurrency(totalGross)}</td>
                <td className="px-3 py-3 text-right font-mono text-green-700">{formatCurrency(totalNet)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Edit / Add modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRecord ? 'Edit Employee' : 'Add Employee'} size="xl">
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Worker #</label>
              <input type="number" value={form.worker_number} onChange={e => setField('worker_number', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Employee Name *</label>
              <input type="text" value={form.employee_name} onChange={e => setField('employee_name', e.target.value)}
                dir="rtl"
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="اسم الموظف" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {FIELDS.map(f => (
              <div key={f.key}>
                <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
                <input
                  type="number"
                  step={f.step}
                  value={form[f.key]}
                  onChange={e => setField(f.key, e.target.value)}
                  className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            ))}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>
              {editRecord ? 'Save Changes' : 'Add Employee'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
