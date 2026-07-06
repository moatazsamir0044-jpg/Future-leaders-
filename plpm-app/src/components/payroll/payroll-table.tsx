'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, Trash2, Calculator } from 'lucide-react'
import type { Employee, PayrollRecord } from '@/types'

const FIELDS = [
  { key: 'attendance_days', label: 'Attendance Days', step: '0.5', group: 'days' },
  { key: 'absence_days', label: 'Absence Days', step: '0.5', group: 'days' },
  { key: 'monthly_leave_days', label: 'Monthly Leave', step: '0.5', group: 'days' },
  { key: 'annual_leave_days', label: 'Annual Leave', step: '0.5', group: 'days' },
  { key: 'absence_no_permission', label: 'Absence (No Permission)', step: '0.5', group: 'days' },
  { key: 'holiday_extra_days', label: 'Holiday Extra Days', step: '0.5', group: 'days' },
  { key: 'net_days', label: 'Net Days (paid)', step: '0.01', group: 'days' },
  { key: 'overtime_hours', label: 'Overtime Hours', step: '0.5', group: 'hours' },
  { key: 'less_hours', label: 'Less Hours', step: '0.5', group: 'hours' },
  { key: 'base_monthly_salary', label: 'Monthly Salary', step: '0.01', group: 'earnings' },
  { key: 'daily_wage', label: 'Daily Wage', step: '0.01', group: 'earnings' },
  { key: 'bonuses', label: 'Bonuses', step: '0.01', group: 'earnings' },
  { key: 'transportation_amount', label: 'Transport Allowance', step: '0.01', group: 'earnings' },
  { key: 'transportation_category', label: 'Transport Category', step: '0.01', group: 'earnings' },
  { key: 'advance', label: 'Advance (سلف)', step: '0.01', group: 'deductions' },
  { key: 'insurance', label: 'Insurance', step: '0.01', group: 'deductions' },
  { key: 'deductions', label: 'Deductions', step: '0.01', group: 'deductions' },
  { key: 'penalties', label: 'Penalties', step: '0.01', group: 'deductions' },
  { key: 'total_gross', label: 'Gross Total', step: '0.01', group: 'totals' },
  { key: 'net_salary', label: 'Net Salary', step: '0.01', group: 'totals' },
] as const

type FieldKey = typeof FIELDS[number]['key']
type FormData = { worker_number: string; employee_name: string } & Record<FieldKey, string>

const SECTIONS: { group: string; title: string }[] = [
  { group: 'days', title: 'Days & Attendance' },
  { group: 'hours', title: 'Hours' },
  { group: 'earnings', title: 'Earnings' },
  { group: 'deductions', title: 'Deductions' },
]

const emptyForm = (): FormData => ({
  worker_number: '', employee_name: '',
  attendance_days: '0', absence_days: '0', net_days: '0',
  monthly_leave_days: '0', annual_leave_days: '0', absence_no_permission: '0',
  holiday_extra_days: '0',
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
    holiday_extra_days: String(r.holiday_extra_days ?? 0),
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

const round2 = (x: number) => Math.round(x * 100) / 100

// gross = net_days × daily_wage + holiday extra days × daily_wage
//         + overtime hours × (daily_wage / 8) − less hours × (daily_wage / 8)
//         + bonuses + transport allowance
// net   = gross − advance − insurance − deductions − penalties
function calcTotals(form: FormData): { gross: number; net: number } {
  const n = (k: FieldKey) => parseFloat(form[k]) || 0
  const hourlyRate = n('daily_wage') / 8
  const gross = n('net_days') * n('daily_wage')
    + n('holiday_extra_days') * n('daily_wage')
    + n('overtime_hours') * hourlyRate
    - n('less_hours') * hourlyRate
    + n('bonuses')
    + n('transportation_amount')
  const net = gross - n('advance') - n('insurance') - n('deductions') - n('penalties')
  return { gross: round2(gross), net: round2(net) }
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
  const [autoCalc, setAutoCalc] = useState(true)
  const [roster, setRoster] = useState<Employee[] | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tableError, setTableError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PayrollRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()
  const toast = useToast()
  const canEdit = periodStatus === 'draft' || periodStatus === 'rejected'

  async function loadRoster() {
    if (roster !== null) return
    const supabase = createClient()
    const { data } = await supabase
      .from('employees')
      .select('*')
      .eq('site_id', siteId)
      .eq('active', true)
      .order('worker_number')
    setRoster(data ?? [])
  }

  function openNew() {
    setEditRecord(null)
    setForm(emptyForm())
    setAutoCalc(true)
    setError('')
    setModalOpen(true)
    void loadRoster()
  }

  function openEdit(r: PayrollRecord) {
    setEditRecord(r)
    const f = recordToForm(r)
    setForm(f)
    // Keep auto mode only if the stored totals already match the formula,
    // so existing hand-entered figures are never silently overwritten.
    const calc = calcTotals(f)
    setAutoCalc(Math.abs(calc.gross - Number(r.total_gross)) < 0.01 && Math.abs(calc.net - Number(r.net_salary)) < 0.01)
    setError('')
    setModalOpen(true)
    void loadRoster()
  }

  function setField(key: string, value: string) {
    setForm(f => ({ ...f, [key]: value }))
  }

  function prefillFromRoster(employeeId: string) {
    const emp = (roster ?? []).find(e => e.id === employeeId)
    if (!emp) return
    setForm(f => ({
      ...f,
      worker_number: emp.worker_number != null ? String(emp.worker_number) : f.worker_number,
      employee_name: emp.name,
      base_monthly_salary: String(emp.base_monthly_salary),
      daily_wage: String(emp.daily_wage),
    }))
  }

  async function handleSave() {
    if (!form.employee_name.trim()) { setError('Employee name is required'); return }
    setSaving(true)
    setError('')
    const supabase = createClient()
    const calc = calcTotals(form)
    const payload = {
      period_id: periodId,
      site_id: siteId,
      worker_number: form.worker_number ? parseInt(form.worker_number) : null,
      employee_name: form.employee_name.trim(),
      ...Object.fromEntries(FIELDS.map(f => [f.key, parseFloat(form[f.key]) || 0])),
      ...(autoCalc ? { total_gross: calc.gross, net_salary: calc.net } : {}),
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
    setTableError('')
    const totalGross = updated.reduce((s: number, r: PayrollRecord) => s + Number(r.total_gross), 0)
    const totalNet = updated.reduce((s: number, r: PayrollRecord) => s + Number(r.net_salary), 0)
    const { error: totalsErr } = await supabase.from('payroll_periods').update({ total_gross: totalGross, total_net: totalNet }).eq('id', periodId)
    if (totalsErr) setTableError(`Record saved, but sheet totals could not be updated: ${totalsErr.message}`)

    toast(editRecord ? `Updated record for ${payload.employee_name}` : `Added ${payload.employee_name} to the sheet`)
    setSaving(false)
    setModalOpen(false)
    startTransition(() => router.refresh())
  }

  async function handleDelete(r: PayrollRecord) {
    setDeleting(true)
    setTableError('')
    const supabase = createClient()
    const { error: deleteErr } = await supabase.from('payroll_records').delete().eq('id', r.id)
    if (deleteErr) {
      setDeleting(false)
      setDeleteTarget(null)
      setTableError(`Could not delete ${r.employee_name}: ${deleteErr.message}`)
      toast(`Could not delete ${r.employee_name}`, 'error')
      return
    }
    const updated = records.filter(rec => rec.id !== r.id)
    setRecords(updated)
    const totalGross = updated.reduce((s: number, rec: PayrollRecord) => s + Number(rec.total_gross), 0)
    const totalNet = updated.reduce((s: number, rec: PayrollRecord) => s + Number(rec.net_salary), 0)
    const { error: totalsErr } = await supabase.from('payroll_periods').update({ total_gross: totalGross, total_net: totalNet }).eq('id', periodId)
    if (totalsErr) setTableError(`Record deleted, but sheet totals could not be updated: ${totalsErr.message}`)
    toast(`Deleted record for ${r.employee_name}`)
    setDeleting(false)
    setDeleteTarget(null)
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

      {tableError && (
        <div className="mx-4 my-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{tableError}</div>
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
              <tr><td colSpan={13} className="px-4 py-10 text-center text-gray-400">No employees yet. Click &quot;Add Employee&quot; to start.</td></tr>
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
                      <button onClick={() => setDeleteTarget(r)} aria-label={`Delete ${r.employee_name}`} className="text-gray-400 hover:text-red-600 p-1 rounded transition-colors">
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

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Payroll Record"
        message={<>Delete the record for <strong dir="rtl">{deleteTarget?.employee_name}</strong>? Sheet totals will be recalculated. This cannot be undone.</>}
        loading={deleting}
        onConfirm={() => deleteTarget && handleDelete(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
      />

      {/* Edit / Add modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editRecord ? 'Edit Employee' : 'Add Employee'} size="xl">
        <div className="space-y-5 max-h-[70vh] overflow-y-auto pr-1">
          {/* Employee identity */}
          <section>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Employee</h3>
            {!editRecord && (roster ?? []).length > 0 && (
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">Prefill from roster (optional)</label>
                <select
                  defaultValue=""
                  onChange={e => prefillFromRoster(e.target.value)}
                  className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Choose an employee to fill name, number, salary & wage…</option>
                  {(roster ?? []).map(emp => (
                    <option key={emp.id} value={emp.id}>
                      {emp.worker_number != null ? `#${emp.worker_number} — ` : ''}{emp.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
          </section>

          {/* Grouped numeric fields */}
          {SECTIONS.map(section => (
            <section key={section.group}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{section.title}</h3>
              <div className="grid grid-cols-3 gap-3">
                {FIELDS.filter(f => f.group === section.group).map(f => (
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
            </section>
          ))}

          {/* Totals */}
          <section className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <Calculator className="h-3.5 w-3.5" /> Totals
              </h3>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCalc}
                  onChange={e => {
                    const on = e.target.checked
                    setAutoCalc(on)
                    if (on) {
                      const calc = calcTotals(form)
                      setForm(f => ({ ...f, total_gross: String(calc.gross), net_salary: String(calc.net) }))
                    }
                  }}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Calculate Gross &amp; Net automatically
              </label>
            </div>

            {(() => {
              const calc = calcTotals(form)
              return (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Gross Total</label>
                      <input
                        type="number" step="0.01"
                        value={autoCalc ? String(calc.gross) : form.total_gross}
                        onChange={e => setField('total_gross', e.target.value)}
                        disabled={autoCalc}
                        className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm font-mono font-semibold text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-blue-50/50 disabled:cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Net Salary</label>
                      <input
                        type="number" step="0.01"
                        value={autoCalc ? String(calc.net) : form.net_salary}
                        onChange={e => setField('net_salary', e.target.value)}
                        disabled={autoCalc}
                        className="w-full h-9 border border-gray-300 rounded-lg px-3 text-sm font-mono font-bold text-green-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-green-50/50 disabled:cursor-not-allowed"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Formula: net days × daily wage + holiday extra days × daily wage + overtime × (daily wage ÷ 8) − less hours × (daily wage ÷ 8) + bonuses + transport = <span className="font-mono">{formatCurrency(calc.gross)}</span> gross;
                    minus advance, insurance, deductions &amp; penalties = <span className="font-mono">{formatCurrency(calc.net)}</span> net.
                    {!autoCalc && ' You are entering totals manually — the calculated values are shown for reference only.'}
                  </p>
                </>
              )
            })()}
          </section>

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
