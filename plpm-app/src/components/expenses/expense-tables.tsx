'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Plus, Pencil, Trash2, Truck, Home, Receipt } from 'lucide-react'
import type { ExpenseTransportation, ExpenseAccommodation, ExpenseItem } from '@/types'

const EXPENSE_CATEGORIES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'materials', label: 'Materials' },
  { value: 'glass_facade', label: 'Glass Facade' },
  { value: 'spider', label: 'Spider System' },
  { value: 'phone', label: 'Phone/Communication' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'other', label: 'Other' },
]

/* ─── Transportation ─────────────────────────────────────────────────────── */

function TransportationTable({
  reportId, rows: initialRows, canEdit,
}: { reportId: string; rows: ExpenseTransportation[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initialRows)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseTransportation | null>(null)
  const [form, setForm] = useState({ vehicle_name: '', daily_cost: '0', days_count: '0' })
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function openNew() { setEditing(null); setForm({ vehicle_name: '', daily_cost: '0', days_count: '0' }); setOpen(true) }
  function openEdit(r: ExpenseTransportation) {
    setEditing(r)
    setForm({ vehicle_name: r.vehicle_name, daily_cost: String(r.daily_cost), days_count: String(r.days_count) })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.vehicle_name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const daily = parseFloat(form.daily_cost) || 0
    const days = parseFloat(form.days_count) || 0
    const total = daily * days
    const payload = {
      report_id: reportId,
      vehicle_name: form.vehicle_name.trim(),
      daily_cost: daily, days_count: days, total,
      sort_order: editing?.sort_order ?? rows.length,
    }
    let result
    if (editing) {
      result = await supabase.from('expense_transportation').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('expense_transportation').insert(payload).select().single()
    }
    if (!result.error) {
      const updated = editing ? rows.map(r => r.id === editing.id ? result.data : r) : [...rows, result.data]
      setRows(updated)
      await recalcTotals(supabase, reportId, updated)
      setOpen(false)
      startTransition(() => router.refresh())
    }
    setSaving(false)
  }

  async function handleDelete(r: ExpenseTransportation) {
    if (!confirm(`Delete "${r.vehicle_name}"?`)) return
    const supabase = createClient()
    await supabase.from('expense_transportation').delete().eq('id', r.id)
    const updated = rows.filter(x => x.id !== r.id)
    setRows(updated)
    await recalcTotals(supabase, reportId, updated)
    startTransition(() => router.refresh())
  }

  const total = rows.reduce((s, r) => s + Number(r.total), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Truck className="h-4 w-4 text-blue-600" /> Transportation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {canEdit && (
          <div className="px-4 py-2 border-b border-gray-100 flex justify-end">
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Vehicle</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Vehicle / Description</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Daily Cost</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Days</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Total</th>
              {canEdit && <th className="px-3 py-2.5 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400 text-xs">No transportation entries</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-800">{r.vehicle_name}</td>
                <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatCurrency(r.daily_cost)}</td>
                <td className="px-4 py-2.5 text-right text-gray-700">{r.days_count}</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-blue-700">{formatCurrency(r.total)}</td>
                {canEdit && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600 p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={3} className="px-4 py-2.5 text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-blue-700">{formatCurrency(total)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Vehicle' : 'Add Vehicle'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Vehicle / Description</label>
            <input type="text" value={form.vehicle_name} onChange={e => setForm(f => ({ ...f, vehicle_name: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Daily Cost (EGP)</label>
              <input type="number" step="0.01" value={form.daily_cost} onChange={e => setForm(f => ({ ...f, daily_cost: e.target.value }))}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Days</label>
              <input type="number" step="0.5" value={form.days_count} onChange={e => setForm(f => ({ ...f, days_count: e.target.value }))}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Total: EGP {formatCurrency((parseFloat(form.daily_cost) || 0) * (parseFloat(form.days_count) || 0))}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── Accommodation ──────────────────────────────────────────────────────── */

function AccommodationTable({
  reportId, rows: initialRows, canEdit,
}: { reportId: string; rows: ExpenseAccommodation[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initialRows)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseAccommodation | null>(null)
  const [form, setForm] = useState({ apartment_name: '', rent_amount: '0' })
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function openNew() { setEditing(null); setForm({ apartment_name: '', rent_amount: '0' }); setOpen(true) }
  function openEdit(r: ExpenseAccommodation) {
    setEditing(r)
    setForm({ apartment_name: r.apartment_name, rent_amount: String(r.rent_amount) })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.apartment_name.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      report_id: reportId,
      apartment_name: form.apartment_name.trim(),
      rent_amount: parseFloat(form.rent_amount) || 0,
      sort_order: editing?.sort_order ?? rows.length,
    }
    let result
    if (editing) {
      result = await supabase.from('expense_accommodation').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('expense_accommodation').insert(payload).select().single()
    }
    if (!result.error) {
      const updated = editing ? rows.map(r => r.id === editing.id ? result.data : r) : [...rows, result.data]
      setRows(updated)
      await recalcTotals(supabase, reportId, undefined, updated)
      setOpen(false)
      startTransition(() => router.refresh())
    }
    setSaving(false)
  }

  async function handleDelete(r: ExpenseAccommodation) {
    if (!confirm(`Delete "${r.apartment_name}"?`)) return
    const supabase = createClient()
    await supabase.from('expense_accommodation').delete().eq('id', r.id)
    const updated = rows.filter(x => x.id !== r.id)
    setRows(updated)
    await recalcTotals(supabase, reportId, undefined, updated)
    startTransition(() => router.refresh())
  }

  const total = rows.reduce((s, r) => s + Number(r.rent_amount), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Home className="h-4 w-4 text-green-600" /> Accommodation
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {canEdit && (
          <div className="px-4 py-2 border-b border-gray-100 flex justify-end">
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Apartment</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Apartment / Location</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Rent (EGP)</th>
              {canEdit && <th className="px-3 py-2.5 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={3} className="px-4 py-6 text-center text-gray-400 text-xs">No accommodation entries</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5 text-gray-800">{r.apartment_name}</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-green-700">{formatCurrency(r.rent_amount)}</td>
                {canEdit && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600 p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td className="px-4 py-2.5 text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-green-700">{formatCurrency(total)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Apartment' : 'Add Apartment'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Apartment / Location</label>
            <input type="text" value={form.apartment_name} onChange={e => setForm(f => ({ ...f, apartment_name: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Rent Amount (EGP)</label>
            <input type="number" step="0.01" value={form.rent_amount} onChange={e => setForm(f => ({ ...f, rent_amount: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── Other Items ────────────────────────────────────────────────────────── */

function ItemsTable({
  reportId, rows: initialRows, canEdit,
}: { reportId: string; rows: ExpenseItem[]; canEdit: boolean }) {
  const [rows, setRows] = useState(initialRows)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ExpenseItem | null>(null)
  const [form, setForm] = useState({ category: 'other', description: '', amount: '0' })
  const [saving, setSaving] = useState(false)
  const [, startTransition] = useTransition()
  const router = useRouter()

  function openNew() { setEditing(null); setForm({ category: 'other', description: '', amount: '0' }); setOpen(true) }
  function openEdit(r: ExpenseItem) {
    setEditing(r)
    setForm({ category: r.category, description: r.description, amount: String(r.amount) })
    setOpen(true)
  }

  async function handleSave() {
    if (!form.description.trim()) return
    setSaving(true)
    const supabase = createClient()
    const payload = {
      report_id: reportId,
      category: form.category,
      description: form.description.trim(),
      amount: parseFloat(form.amount) || 0,
      sort_order: editing?.sort_order ?? rows.length,
    }
    let result
    if (editing) {
      result = await supabase.from('expense_items').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('expense_items').insert(payload).select().single()
    }
    if (!result.error) {
      const updated = editing ? rows.map(r => r.id === editing.id ? result.data : r) : [...rows, result.data]
      setRows(updated)
      await recalcTotals(supabase, reportId, undefined, undefined, updated)
      setOpen(false)
      startTransition(() => router.refresh())
    }
    setSaving(false)
  }

  async function handleDelete(r: ExpenseItem) {
    if (!confirm(`Delete "${r.description}"?`)) return
    const supabase = createClient()
    await supabase.from('expense_items').delete().eq('id', r.id)
    const updated = rows.filter(x => x.id !== r.id)
    setRows(updated)
    await recalcTotals(supabase, reportId, undefined, undefined, updated)
    startTransition(() => router.refresh())
  }

  const total = rows.reduce((s, r) => s + Number(r.amount), 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Receipt className="h-4 w-4 text-purple-600" /> Other Expenses
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {canEdit && (
          <div className="px-4 py-2 border-b border-gray-100 flex justify-end">
            <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Item</Button>
          </div>
        )}
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50/70 border-b border-gray-100">
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Category</th>
              <th className="text-left px-4 py-2.5 font-medium text-gray-600">Description</th>
              <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount (EGP)</th>
              {canEdit && <th className="px-3 py-2.5 w-16" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400 text-xs">No expense items</td></tr>
            ) : rows.map(r => (
              <tr key={r.id} className="hover:bg-gray-50/50">
                <td className="px-4 py-2.5">
                  <span className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded capitalize">{r.category.replace('_', ' ')}</span>
                </td>
                <td className="px-4 py-2.5 text-gray-800">{r.description}</td>
                <td className="px-4 py-2.5 text-right font-mono font-medium text-purple-700">{formatCurrency(r.amount)}</td>
                {canEdit && (
                  <td className="px-3 py-2.5">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => openEdit(r)} className="text-gray-400 hover:text-blue-600 p-1 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => handleDelete(r)} className="text-gray-400 hover:text-red-600 p-1 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-semibold">
                <td colSpan={2} className="px-4 py-2.5 text-gray-700">Total</td>
                <td className="px-4 py-2.5 text-right font-mono text-purple-700">{formatCurrency(total)}</td>
                {canEdit && <td />}
              </tr>
            </tfoot>
          )}
        </table>
      </CardContent>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Item' : 'Add Item'} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              {EXPENSE_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input type="text" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Amount (EGP)</label>
            <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save' : 'Add'}</Button>
          </div>
        </div>
      </Modal>
    </Card>
  )
}

/* ─── Shared recalc helper ───────────────────────────────────────────────── */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function recalcTotals(
  supabase: ReturnType<typeof createClient>,
  reportId: string,
  transport?: ExpenseTransportation[],
  accomm?: ExpenseAccommodation[],
  items?: ExpenseItem[],
) {
  const totalTransportation = (transport ?? []).reduce((s, r) => s + Number(r.total), 0)
  const totalAccommodation = (accomm ?? []).reduce((s, r) => s + Number(r.rent_amount), 0)
  const totalOther = (items ?? []).reduce((s, r) => s + Number(r.amount), 0)
  const grandTotal = totalTransportation + totalAccommodation + totalOther

  await supabase
    .from('expense_reports')
    .update({ total_transportation: totalTransportation, total_accommodation: totalAccommodation, total_other: totalOther, grand_total: grandTotal })
    .eq('id', reportId)
}

/* ─── Main export ────────────────────────────────────────────────────────── */

export function ExpenseTables({
  reportId, transportation, accommodation, items, reportStatus,
}: {
  reportId: string
  transportation: ExpenseTransportation[]
  accommodation: ExpenseAccommodation[]
  items: ExpenseItem[]
  reportStatus: string
}) {
  const canEdit = reportStatus === 'draft' || reportStatus === 'rejected'

  return (
    <div className="space-y-6">
      <TransportationTable reportId={reportId} rows={transportation} canEdit={canEdit} />
      <AccommodationTable reportId={reportId} rows={accommodation} canEdit={canEdit} />
      <ItemsTable reportId={reportId} rows={items} canEdit={canEdit} />
    </div>
  )
}
