'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import type { Client, Contract, Site } from '@/types'
import { MONTHS } from '@/types'

type FormData = {
  client_id: string
  name: string
  monthly_value: string
  payment_terms_days: string
  escalation_percent: string
  escalation_month: string
  start_date: string
  notes: string
  site_ids: string[]
}

const emptyForm = (): FormData => ({
  client_id: '', name: '', monthly_value: '', payment_terms_days: '30',
  escalation_percent: '', escalation_month: '', start_date: '', notes: '', site_ids: [],
})

function contractToForm(c: Contract): FormData {
  return {
    client_id: c.client_id,
    name: c.name,
    monthly_value: String(c.monthly_value ?? ''),
    payment_terms_days: String(c.payment_terms_days ?? 30),
    escalation_percent: c.escalation_percent != null ? String(c.escalation_percent) : '',
    escalation_month: c.escalation_month != null ? String(c.escalation_month) : '',
    start_date: c.start_date ?? '',
    notes: c.notes ?? '',
    site_ids: (c.contract_sites ?? []).map(cs => cs.site_id),
  }
}

export function ContractManager({ contracts: initial, clients, sites }: {
  contracts: Contract[]
  clients: Client[]
  sites: Site[]
}) {
  const [contracts, setContracts] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contract | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  const activeClients = clients.filter(c => c.active)

  function openNew() { setEditing(null); setForm(emptyForm()); setError(''); setOpen(true) }
  function openEdit(c: Contract) { setEditing(c); setForm(contractToForm(c)); setError(''); setOpen(true) }
  function setF<K extends keyof FormData>(key: K, value: FormData[K]) { setForm(f => ({ ...f, [key]: value })) }

  function toggleSite(siteId: string) {
    setForm(f => ({
      ...f,
      site_ids: f.site_ids.includes(siteId) ? f.site_ids.filter(s => s !== siteId) : [...f.site_ids, siteId],
    }))
  }

  async function handleSave() {
    if (!form.client_id) { setError('Client is required'); return }
    if (!form.name.trim()) { setError('Contract name is required'); return }
    const monthlyValue = parseFloat(form.monthly_value)
    if (!Number.isFinite(monthlyValue) || monthlyValue < 0) { setError('Monthly value must be a valid amount'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      client_id: form.client_id,
      name: form.name.trim(),
      monthly_value: monthlyValue,
      payment_terms_days: parseInt(form.payment_terms_days) || 30,
      escalation_percent: form.escalation_percent ? parseFloat(form.escalation_percent) : null,
      escalation_month: form.escalation_month ? parseInt(form.escalation_month) : null,
      start_date: form.start_date || null,
      notes: form.notes.trim() || null,
    }
    let result
    if (editing) {
      result = await supabase.from('contracts').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('contracts').insert({ ...payload, active: true }).select().single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }
    const saved = result.data as Contract

    // Replace site links wholesale — the set in the form is the source of truth
    const { error: delErr } = await supabase.from('contract_sites').delete().eq('contract_id', saved.id)
    if (delErr) { setError(delErr.message); setSaving(false); return }
    if (form.site_ids.length > 0) {
      const { error: insErr } = await supabase.from('contract_sites')
        .insert(form.site_ids.map(site_id => ({ contract_id: saved.id, site_id })))
      if (insErr) { setError(insErr.message); setSaving(false); return }
    }

    const withJoins: Contract = {
      ...saved,
      client: clients.find(c => c.id === saved.client_id),
      contract_sites: form.site_ids.map(site_id => ({ site_id, site: sites.find(s => s.id === site_id) })),
    }
    setContracts(editing ? contracts.map(c => c.id === editing.id ? withJoins : c) : [...contracts, withJoins])
    toast(editing ? `Updated ${payload.name}` : `Added contract ${payload.name}`)
    setSaving(false); setOpen(false)
  }

  async function handleToggle(c: Contract) {
    const supabase = createClient()
    const { error: err } = await supabase.from('contracts').update({ active: !c.active }).eq('id', c.id)
    if (err) { toast(`Could not update ${c.name}: ${err.message}`, 'error'); return }
    setContracts(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x))
    toast(c.active ? `${c.name} deactivated — no new invoices can be created for it` : `${c.name} activated`)
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex justify-end">
        <Button size="sm" onClick={openNew} disabled={activeClients.length === 0}
          title={activeClients.length === 0 ? 'Add a client first' : undefined}>
          <Plus className="h-3.5 w-3.5" /> Add Contract
        </Button>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead>
          <tr className="bg-gray-50/70 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Contract</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Client</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Sites</th>
            <th className="text-right px-4 py-2.5 font-medium text-gray-600">Monthly Value</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Terms</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Escalation</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Active</th>
            <th className="px-3 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {contracts.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-gray-400">
                No contracts yet — each monthly invoice is issued against a contract.
              </td>
            </tr>
          ) : contracts.map(c => (
            <tr key={c.id} className={`hover:bg-gray-50/50 ${!c.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
              <td className="px-4 py-2.5 text-gray-600">{c.client?.name ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-500 text-xs max-w-[200px]">
                {(c.contract_sites ?? []).length === 0
                  ? <span className="text-amber-600">No sites linked</span>
                  : (c.contract_sites ?? []).map(cs => cs.site?.name).filter(Boolean).join(', ')}
              </td>
              <td className="px-4 py-2.5 text-right font-mono text-gray-700">{formatCurrency(c.monthly_value)}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{c.payment_terms_days} days</td>
              <td className="px-4 py-2.5 text-center text-gray-500 text-xs">
                {c.escalation_percent != null
                  ? `${c.escalation_percent}%${c.escalation_month ? ` (${MONTHS[c.escalation_month - 1]})` : ''}`
                  : '—'}
              </td>
              <td className="px-4 py-2.5 text-center">
                <button onClick={() => handleToggle(c)} aria-label={c.active ? `Deactivate ${c.name}` : `Activate ${c.name}`} className={`${c.active ? 'text-green-600' : 'text-gray-400'} hover:opacity-70`}>
                  {c.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button onClick={() => openEdit(c)} aria-label={`Edit ${c.name}`} className="text-gray-400 hover:text-blue-600 p-1 rounded">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Contract' : 'Add Contract'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client *</label>
              <select value={form.client_id} onChange={e => setF('client_id', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">Select client…</option>
                {activeClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Contract Name *</label>
              <input type="text" value={form.name} onChange={e => setF('name', e.target.value)}
                placeholder="e.g. CFCM housekeeping"
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Monthly Value (EGP) *</label>
              <input type="number" min="0" value={form.monthly_value} onChange={e => setF('monthly_value', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Payment Terms (days)</label>
              <input type="number" min="0" value={form.payment_terms_days} onChange={e => setF('payment_terms_days', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
              <input type="date" value={form.start_date} onChange={e => setF('start_date', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Annual Escalation %</label>
              <input type="number" min="0" step="0.5" value={form.escalation_percent} onChange={e => setF('escalation_percent', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Escalation Month</label>
              <select value={form.escalation_month} onChange={e => setF('escalation_month', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="">—</option>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1.5">Sites covered by this contract</label>
            {sites.length === 0 ? (
              <p className="text-sm text-gray-400">No active sites.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-44 overflow-y-auto border border-gray-200 rounded-lg p-3">
                {sites.map(s => (
                  <label key={s.id} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input type="checkbox" checked={form.site_ids.includes(s.id)} onChange={() => toggleSite(s.id)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                    <span className="truncate">{s.name}</span>
                  </label>
                ))}
              </div>
            )}
            <p className="text-xs text-gray-400 mt-1">Site links power the profit-per-contract view (contract revenue vs. payroll + expenses of its sites).</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes (penalty terms, SLA…)</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Add Contract'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
