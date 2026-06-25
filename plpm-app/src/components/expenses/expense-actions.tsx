'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { exportExpenseToExcel } from '@/lib/export/excel'
import { exportExpenseToPDF } from '@/lib/export/pdf'
import { FileSpreadsheet, FileText, Send, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import type { ExpenseReport, ExpenseTransportation, ExpenseAccommodation, ExpenseItem, Site } from '@/types'

interface Props {
  report: ExpenseReport
  transportation: ExpenseTransportation[]
  accommodation: ExpenseAccommodation[]
  items: ExpenseItem[]
  site: Site
  role: string
}

export function ExpenseActions({ report, transportation, accommodation, items, site, role }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [error, setError] = useState('')

  const isAdmin = role === 'admin'
  const status = report.status
  const hasData = transportation.length > 0 || accommodation.length > 0 || items.length > 0

  async function updateStatus(newStatus: string, notes?: string) {
    setLoading(newStatus)
    const supabase = createClient()
    const updates: Record<string, unknown> = { status: newStatus }
    if (newStatus === 'rejected' && notes) updates.rejection_notes = notes
    if (newStatus === 'approved') updates.rejection_notes = null

    const { error: err } = await supabase.from('expense_reports').update(updates).eq('id', report.id)
    if (!err) {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        await supabase.from('approval_logs').insert({
          entity_type: 'expense',
          entity_id: report.id,
          action: newStatus === 'submitted' ? 'submitted' : newStatus === 'approved' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'reset',
          performed_by: user.id,
          notes: notes ?? null,
        })
      }
      router.refresh()
    }
    setLoading(null)
  }

  async function handleReject() {
    if (!rejectionNotes.trim()) { setError('Please provide rejection reason'); return }
    setRejectOpen(false)
    await updateStatus('rejected', rejectionNotes.trim())
    setRejectionNotes('')
    setError('')
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button variant="outline" size="sm" onClick={() => exportExpenseToExcel(report, site, transportation, accommodation, items)} disabled={!hasData}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={() => exportExpenseToPDF(report, site, transportation, accommodation, items)} disabled={!hasData}>
        <FileText className="h-3.5 w-3.5" /> PDF
      </Button>

      {status === 'draft' && (
        <Button size="sm" onClick={() => updateStatus('submitted')} loading={loading === 'submitted'}>
          <Send className="h-3.5 w-3.5" /> Submit for Approval
        </Button>
      )}

      {status === 'submitted' && isAdmin && (
        <>
          <Button size="sm" onClick={() => updateStatus('approved')} loading={loading === 'approved'}
            className="bg-green-600 hover:bg-green-700 text-white">
            <CheckCircle className="h-3.5 w-3.5" /> Approve
          </Button>
          <Button size="sm" variant="danger" onClick={() => setRejectOpen(true)}>
            <XCircle className="h-3.5 w-3.5" /> Reject
          </Button>
        </>
      )}

      {(status === 'approved' || status === 'rejected') && isAdmin && (
        <Button size="sm" variant="outline" onClick={() => updateStatus('draft')} loading={loading === 'draft'}>
          <RotateCcw className="h-3.5 w-3.5" /> Reset to Draft
        </Button>
      )}

      <Modal open={rejectOpen} onClose={() => { setRejectOpen(false); setError('') }} title="Reject Expense Report" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason for rejection *</label>
            <textarea
              value={rejectionNotes}
              onChange={e => setRejectionNotes(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
              placeholder="Explain what needs to be corrected…"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setRejectOpen(false); setError('') }}>Cancel</Button>
            <Button variant="danger" onClick={handleReject}>Confirm Reject</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
