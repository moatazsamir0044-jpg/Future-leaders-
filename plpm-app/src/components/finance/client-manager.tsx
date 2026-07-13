'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import type { Client } from '@/types'

type FormData = { name: string; name_ar: string; notes: string }
const emptyForm = (): FormData => ({ name: '', name_ar: '', notes: '' })
function clientToForm(c: Client): FormData {
  return { name: c.name, name_ar: c.name_ar ?? '', notes: c.notes ?? '' }
}

export function ClientManager({ clients: initial }: { clients: Client[] }) {
  const [clients, setClients] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Client | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  function openNew() { setEditing(null); setForm(emptyForm()); setError(''); setOpen(true) }
  function openEdit(c: Client) { setEditing(c); setForm(clientToForm(c)); setError(''); setOpen(true) }
  function setF(key: keyof FormData, value: string) { setForm(f => ({ ...f, [key]: value })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() || null,
      notes: form.notes.trim() || null,
    }
    let result
    if (editing) {
      result = await supabase.from('clients').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('clients').insert({ ...payload, active: true }).select().single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }
    setClients(editing ? clients.map(c => c.id === editing.id ? result.data : c) : [...clients, result.data])
    toast(editing ? `Updated ${payload.name}` : `Added client ${payload.name}`)
    setSaving(false); setOpen(false)
  }

  async function handleToggle(c: Client) {
    const supabase = createClient()
    const { error: err } = await supabase.from('clients').update({ active: !c.active }).eq('id', c.id)
    if (err) { toast(`Could not update ${c.name}: ${err.message}`, 'error'); return }
    setClients(prev => prev.map(x => x.id === c.id ? { ...x, active: !x.active } : x))
    toast(c.active ? `${c.name} deactivated` : `${c.name} activated`)
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Client</Button>
      </div>
      <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[560px]">
        <thead>
          <tr className="bg-gray-50/70 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Arabic Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Notes</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Active</th>
            <th className="px-3 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {clients.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-8 text-center text-gray-400">
                No clients yet — add the entities you issue invoices to.
              </td>
            </tr>
          ) : clients.map(c => (
            <tr key={c.id} className={`hover:bg-gray-50/50 ${!c.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{c.name}</td>
              <td className="px-4 py-2.5 text-gray-600" dir="rtl">{c.name_ar ?? '—'}</td>
              <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{c.notes ?? '—'}</td>
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

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Client' : 'Add Client'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name (English) *</label>
              <input type="text" value={form.name} onChange={e => setF('name', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name (Arabic)</label>
              <input type="text" value={form.name_ar} onChange={e => setF('name_ar', e.target.value)} dir="rtl"
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={form.notes} onChange={e => setF('notes', e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Add Client'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
