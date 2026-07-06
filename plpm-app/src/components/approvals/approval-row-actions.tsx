'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateApprovalStatus, type ApprovalEntity } from '@/lib/approvals'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { CheckCircle, XCircle } from 'lucide-react'

export function ApprovalRowActions({ entity, id, name }: { entity: ApprovalEntity; id: string; name: string }) {
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()
  const toast = useToast()

  async function act(status: 'approved' | 'rejected', rejectionNotes?: string) {
    setLoading(status)
    const err = await updateApprovalStatus(entity, id, status, rejectionNotes)
    setLoading(null)
    if (err) {
      toast(`Could not update ${name}: ${err}`, 'error')
      return
    }
    toast(status === 'approved' ? `Approved ${name}` : `Rejected ${name}`)
    setRejectOpen(false)
    setNotes('')
    router.refresh()
  }

  function handleReject() {
    if (!notes.trim()) { setError('Please provide a rejection reason'); return }
    setError('')
    void act('rejected', notes.trim())
  }

  return (
    <div className="flex items-center gap-1.5 justify-end">
      <Button
        size="sm"
        onClick={() => act('approved')}
        loading={loading === 'approved'}
        className="bg-green-600 hover:bg-green-700 text-white h-7 px-2.5 text-xs"
      >
        <CheckCircle className="h-3 w-3" /> Approve
      </Button>
      <Button
        size="sm"
        variant="danger"
        onClick={() => { setError(''); setRejectOpen(true) }}
        className="h-7 px-2.5 text-xs"
      >
        <XCircle className="h-3 w-3" /> Reject
      </Button>

      <Modal open={rejectOpen} onClose={() => { setRejectOpen(false); setError('') }} title={`Reject — ${name}`} size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection *</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explain what needs to be corrected…"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setRejectOpen(false); setError('') }}>Cancel</Button>
            <Button variant="danger" onClick={handleReject} loading={loading === 'rejected'}>Confirm Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
