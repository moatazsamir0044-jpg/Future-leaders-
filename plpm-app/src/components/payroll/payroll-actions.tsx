'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateApprovalStatus, type WorkflowStatus } from '@/lib/approvals'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { exportPayrollToExcel } from '@/lib/export/excel'
import { exportPayrollToPDF } from '@/lib/export/pdf'
import { FileSpreadsheet, FileText, Send, CheckCircle, XCircle, RotateCcw } from 'lucide-react'
import type { PayrollPeriod, PayrollRecord, Site } from '@/types'

interface Props {
  period: PayrollPeriod
  records: PayrollRecord[]
  site: Site
  role: string
}

const STATUS_TOAST: Record<string, string> = {
  submitted: 'Payroll submitted for approval',
  approved: 'Payroll approved',
  rejected: 'Payroll rejected',
  draft: 'Payroll reset to draft — it can be edited again',
}

export function PayrollActions({ period, records, site, role }: Props) {
  const router = useRouter()
  const toast = useToast()
  const [loading, setLoading] = useState<string | null>(null)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectionNotes, setRejectionNotes] = useState('')
  const [error, setError] = useState('')
  const [actionError, setActionError] = useState('')

  const isAdmin = role === 'admin'
  const status = period.status

  async function updateStatus(newStatus: WorkflowStatus, notes?: string) {
    setLoading(newStatus)
    setActionError('')
    const err = await updateApprovalStatus('payroll', period.id, newStatus, notes)
    if (err) {
      setActionError(`Could not update status: ${err}`)
      toast('Status update failed', 'error')
      setLoading(null)
      return
    }
    toast(STATUS_TOAST[newStatus] ?? 'Status updated')
    router.refresh()
    setLoading(null)
  }

  async function handleReject() {
    if (!rejectionNotes.trim()) { setError('Please provide rejection reason'); return }
    setRejectOpen(false)
    await updateStatus('rejected', rejectionNotes.trim())
    setRejectionNotes('')
    setError('')
  }

  function handleExcelExport() {
    exportPayrollToExcel(period, site, records)
  }

  function handlePDFExport() {
    exportPayrollToPDF(period, site, records)
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {actionError && (
        <p className="w-full text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{actionError}</p>
      )}
      {/* Export buttons — always visible */}
      <Button variant="outline" size="sm" onClick={handleExcelExport} disabled={records.length === 0}>
        <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
      </Button>
      <Button variant="outline" size="sm" onClick={handlePDFExport} disabled={records.length === 0}>
        <FileText className="h-3.5 w-3.5" /> PDF
      </Button>

      {/* Workflow actions */}
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

      {/* Reject modal */}
      <Modal open={rejectOpen} onClose={() => { setRejectOpen(false); setError('') }} title="Reject Payroll" size="sm">
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
