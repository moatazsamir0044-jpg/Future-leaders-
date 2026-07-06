'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react'
import type { Site, ServiceType } from '@/types'

const SERVICE_TYPES: { value: ServiceType; label: string }[] = [
  { value: 'hk', label: 'Housekeeping (HK)' },
  { value: 'ls', label: 'Landscaping (LS)' },
  { value: 'fm', label: 'Facility Management (FM)' },
  { value: 'other', label: 'Other' },
]

type FormData = { name: string; name_ar: string; service_type: ServiceType; client_name: string; sort_order: string }
const emptyForm = (): FormData => ({ name: '', name_ar: '', service_type: 'hk', client_name: '', sort_order: '0' })
function siteToForm(s: Site): FormData {
  return { name: s.name, name_ar: s.name_ar ?? '', service_type: s.service_type, client_name: s.client_name ?? '', sort_order: String(s.sort_order) }
}

export function SiteManager({ sites: initial }: { sites: Site[] }) {
  const [sites, setSites] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Site | null>(null)
  const [form, setForm] = useState<FormData>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const toast = useToast()

  function openNew() { setEditing(null); setForm(emptyForm()); setError(''); setOpen(true) }
  function openEdit(s: Site) { setEditing(s); setForm(siteToForm(s)); setError(''); setOpen(true) }
  function setF(key: keyof FormData, value: string) { setForm(f => ({ ...f, [key]: value })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError('')
    const supabase = createClient()
    const payload = {
      name: form.name.trim(),
      name_ar: form.name_ar.trim() || null,
      service_type: form.service_type,
      client_name: form.client_name.trim() || null,
      sort_order: parseInt(form.sort_order) || 0,
    }
    let result
    if (editing) {
      result = await supabase.from('sites').update(payload).eq('id', editing.id).select().single()
    } else {
      result = await supabase.from('sites').insert({ ...payload, active: true }).select().single()
    }
    if (result.error) { setError(result.error.message); setSaving(false); return }
    setSites(editing ? sites.map(s => s.id === editing.id ? result.data : s) : [...sites, result.data])
    toast(editing ? `Updated ${payload.name}` : `Added site ${payload.name}`)
    setSaving(false); setOpen(false)
  }

  async function handleToggle(s: Site) {
    const supabase = createClient()
    const { error: err } = await supabase.from('sites').update({ active: !s.active }).eq('id', s.id)
    if (err) { toast(`Could not update ${s.name}: ${err.message}`, 'error'); return }
    setSites(prev => prev.map(x => x.id === s.id ? { ...x, active: !x.active } : x))
    toast(s.active ? `${s.name} deactivated — it will be hidden from new sheets and filters` : `${s.name} activated`)
  }

  return (
    <>
      <div className="px-4 py-3 border-b border-gray-100 flex justify-end">
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5" /> Add Site</Button>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/70 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Arabic Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Type</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Client</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Sort</th>
            <th className="text-center px-4 py-2.5 font-medium text-gray-600">Active</th>
            <th className="px-3 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {sites.map(s => (
            <tr key={s.id} className={`hover:bg-gray-50/50 ${!s.active ? 'opacity-50' : ''}`}>
              <td className="px-4 py-2.5 font-medium text-gray-900">{s.name}</td>
              <td className="px-4 py-2.5 text-gray-600" dir="rtl">{s.name_ar ?? '—'}</td>
              <td className="px-4 py-2.5">
                <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded uppercase">{s.service_type}</span>
              </td>
              <td className="px-4 py-2.5 text-gray-600">{s.client_name ?? '—'}</td>
              <td className="px-4 py-2.5 text-center text-gray-500 text-xs">{s.sort_order}</td>
              <td className="px-4 py-2.5 text-center">
                <button onClick={() => handleToggle(s)} className={`${s.active ? 'text-green-600' : 'text-gray-400'} hover:opacity-70`}>
                  {s.active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                </button>
              </td>
              <td className="px-3 py-2.5">
                <button onClick={() => openEdit(s)} className="text-gray-400 hover:text-blue-600 p-1 rounded">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? 'Edit Site' : 'Add Site'} size="md">
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
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Service Type</label>
              <select value={form.service_type} onChange={e => setF('service_type', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                {SERVICE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Client Name</label>
              <input type="text" value={form.client_name} onChange={e => setF('client_name', e.target.value)}
                className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Sort Order</label>
            <input type="number" value={form.sort_order} onChange={e => setF('sort_order', e.target.value)}
              className="w-32 h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>{editing ? 'Save Changes' : 'Add Site'}</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
