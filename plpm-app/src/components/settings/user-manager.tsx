'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { Pencil } from 'lucide-react'
import type { UserProfile, UserRole } from '@/types'

export function UserManager({ profiles: initial }: { profiles: UserProfile[] }) {
  const [profiles, setProfiles] = useState(initial)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserProfile | null>(null)
  const [form, setForm] = useState({ full_name: '', role: 'finance' as UserRole })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function openEdit(p: UserProfile) {
    setEditing(p)
    setForm({ full_name: p.full_name, role: p.role })
    setError('')
    setOpen(true)
  }

  async function handleSave() {
    if (!form.full_name.trim()) { setError('Name is required'); return }
    if (!editing) return
    setSaving(true); setError('')
    const supabase = createClient()
    const { error: err } = await supabase
      .from('user_profiles')
      .update({ full_name: form.full_name.trim(), role: form.role })
      .eq('id', editing.id)
    if (err) { setError(err.message); setSaving(false); return }
    setProfiles(prev => prev.map(p => p.id === editing.id ? { ...p, full_name: form.full_name.trim(), role: form.role } : p))
    setSaving(false); setOpen(false)
  }

  return (
    <>
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50/70 border-b border-gray-100">
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Name</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Role</th>
            <th className="text-left px-4 py-2.5 font-medium text-gray-600">Joined</th>
            <th className="px-3 py-2.5 w-16" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {profiles.length === 0 ? (
            <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No users yet</td></tr>
          ) : profiles.map(p => (
            <tr key={p.id} className="hover:bg-gray-50/50">
              <td className="px-4 py-2.5 font-medium text-gray-900">{p.full_name}</td>
              <td className="px-4 py-2.5">
                <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.role === 'admin' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                  {p.role}
                </span>
              </td>
              <td className="px-4 py-2.5 text-gray-500 text-xs">{new Date(p.created_at).toLocaleDateString()}</td>
              <td className="px-3 py-2.5">
                <button onClick={() => openEdit(p)} className="text-gray-400 hover:text-blue-600 p-1 rounded">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <Modal open={open} onClose={() => setOpen(false)} title="Edit User" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
            <input type="text" value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
            <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as UserRole }))}
              className="w-full h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="finance">Finance</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
