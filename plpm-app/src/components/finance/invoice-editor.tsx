'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, ChevronRight, ChevronLeft, Calculator } from 'lucide-react'
import type { Invoice, InvoiceDeduction, DeductionReason, CollectionMethod, InvoiceStatus } from '@/types'
import {
  INVOICE_STATUS_FLOW, INVOICE_STATUS_LABELS, INVOICE_STATUS_LABELS_AR,
  DEDUCTION_REASON_LABELS, COLLECTION_METHOD_LABELS,
} from '@/types'

interface DeductionRow {
  key: string
  reason: DeductionReason
  description: string
  amount: string
}

const today = () => new Date().toISOString().slice(0, 10)

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InvoiceEditor({ invoice, deductions: initialDeductions }: {
  invoice: Invoice
  deductions: InvoiceDeduction[]
}) {
  const router = useRouter()
  const toast = useToast()
  const supabase = createClient()

  const [status, setStatus] = useState<InvoiceStatus>(invoice.status)
  const [gross, setGross] = useState(String(invoice.gross_amount ?? 0))
  const [rows, setRows] = useState<DeductionRow[]>(initialDeductions.map((d, i) => ({
    key: d.id ?? String(i),
    reason: d.reason,
    description: d.description ?? '',
    amount: String(d.amount ?? 0),
  })))
  const [withholding, setWithholding] = useState(String(invoice.withholding_amount ?? 0))
  const [creditNote, setCreditNote] = useState(String(invoice.credit_note_amount ?? 0))
  const [creditNoteReason, setCreditNoteReason] = useState(invoice.credit_note_reason ?? '')
  const [etaRef, setEtaRef] = useState(invoice.eta_reference ?? '')
  const [notes, setNotes] = useState(invoice.notes ?? '')
  const [issueDate, setIssueDate] = useState(invoice.issue_date ?? '')
  const [dueDate, setDueDate] = useState(invoice.due_date ?? '')
  const [collectedDate, setCollectedDate] = useState(invoice.collected_date ?? '')
  const [collectionMethod, setCollectionMethod] = useState<CollectionMethod>(invoice.collection_method ?? 'transfer')

  const [saving, setSaving] = useState(false)
  const [advancing, setAdvancing] = useState(false)
  const [issueModal, setIssueModal] = useState(false)
  const [collectModal, setCollectModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const statusIdx = INVOICE_STATUS_FLOW.indexOf(status)
  // Per current practice: after ETA issue, amounts only change via credit note
  const amountsLocked = statusIdx >= INVOICE_STATUS_FLOW.indexOf('issued')

  const grossNum = parseFloat(gross) || 0
  const totalDeductions = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0)
  const creditNoteNum = parseFloat(creditNote) || 0
  const withholdingNum = parseFloat(withholding) || 0
  const net = grossNum - totalDeductions - creditNoteNum
  const expectedCollection = net - withholdingNum

  function addRow() {
    setRows(r => [...r, { key: `new-${Date.now()}`, reason: 'other', description: '', amount: '' }])
  }
  function updateRow(key: string, patch: Partial<DeductionRow>) {
    setRows(r => r.map(x => x.key === key ? { ...x, ...patch } : x))
  }
  function removeRow(key: string) {
    setRows(r => r.filter(x => x.key !== key))
  }

  function amountsPayload() {
    return {
      gross_amount: grossNum,
      total_deductions: totalDeductions,
      credit_note_amount: creditNoteNum,
      credit_note_reason: creditNoteReason.trim() || null,
      net_amount: net,
      withholding_amount: withholdingNum,
      eta_reference: etaRef.trim() || null,
      notes: notes.trim() || null,
    }
  }

  async function saveDeductions(): Promise<string | null> {
    const { error: delErr } = await supabase.from('invoice_deductions').delete().eq('invoice_id', invoice.id)
    if (delErr) return delErr.message
    const valid = rows.filter(r => (parseFloat(r.amount) || 0) !== 0 || r.description.trim())
    if (valid.length > 0) {
      const { error: insErr } = await supabase.from('invoice_deductions').insert(valid.map((r, i) => ({
        invoice_id: invoice.id,
        reason: r.reason,
        description: r.description.trim() || null,
        amount: parseFloat(r.amount) || 0,
        sort_order: i,
      })))
      if (insErr) return insErr.message
    }
    return null
  }

  async function handleSave() {
    setSaving(true)
    const { error: updErr } = await supabase.from('invoices').update(amountsPayload()).eq('id', invoice.id)
    const dedErr = updErr ? null : await saveDeductions()
    setSaving(false)
    if (updErr || dedErr) { toast(`Could not save: ${updErr?.message ?? dedErr}`, 'error'); return }
    toast('Invoice saved')
    router.refresh()
  }

  async function moveToStatus(next: InvoiceStatus, extra: Record<string, unknown> = {}) {
    setAdvancing(true)
    // Persist any unsaved amount edits along with the transition
    const { error: updErr } = await supabase.from('invoices')
      .update({ ...amountsPayload(), status: next, ...extra })
      .eq('id', invoice.id)
    const dedErr = updErr ? null : await saveDeductions()
    setAdvancing(false)
    if (updErr || dedErr) { toast(`Could not update status: ${updErr?.message ?? dedErr}`, 'error'); return }
    setStatus(next)
    toast(`Invoice moved to "${INVOICE_STATUS_LABELS[next]}"`)
    router.refresh()
  }

  function handleAdvance() {
    const next = INVOICE_STATUS_FLOW[statusIdx + 1]
    if (!next) return
    if (next === 'issued') { setIssueDate(issueDate || today()); setIssueModal(true); return }
    if (next === 'collected') { setCollectedDate(collectedDate || today()); setCollectModal(true); return }
    moveToStatus(next)
  }

  async function confirmIssue() {
    if (!issueDate) { toast('Issue date is required', 'error'); return }
    const terms = invoice.contract?.payment_terms_days ?? 30
    const due = addDays(issueDate, terms)
    setDueDate(due)
    setIssueModal(false)
    await moveToStatus('issued', { issue_date: issueDate, due_date: due })
  }

  async function confirmCollect() {
    if (!collectedDate) { toast('Collection date is required', 'error'); return }
    setCollectModal(false)
    await moveToStatus('collected', { collected_date: collectedDate, collection_method: collectionMethod })
  }

  function handleBack() {
    const prev = INVOICE_STATUS_FLOW[statusIdx - 1]
    if (!prev) return
    // Undo the fields set by the step we're leaving
    if (status === 'issued') {
      setIssueDate(''); setDueDate('')
      moveToStatus(prev, { issue_date: null, due_date: null })
    } else if (status === 'collected') {
      setCollectedDate('')
      moveToStatus(prev, { collected_date: null, collection_method: null })
    } else {
      moveToStatus(prev)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    const { error: err } = await supabase.from('invoices').delete().eq('id', invoice.id)
    if (err) { toast(`Could not delete: ${err.message}`, 'error'); setDeleting(false); return }
    toast('Invoice deleted')
    router.push(`/dashboard/invoices?month=${invoice.month}&year=${invoice.year}`)
    router.refresh()
  }

  const inputCls = 'h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500'

  return (
    <div className="space-y-6">
      {/* Status pipeline */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <ol className="flex items-center flex-wrap gap-1 text-xs">
              {INVOICE_STATUS_FLOW.map((s, i) => (
                <li key={s} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
                  <span
                    title={INVOICE_STATUS_LABELS_AR[s]}
                    className={`px-2 py-1 rounded-md font-medium ${
                      i < statusIdx ? 'bg-green-50 text-green-700'
                      : i === statusIdx ? 'bg-blue-600 text-white'
                      : 'bg-gray-50 text-gray-400'
                    }`}
                  >
                    {INVOICE_STATUS_LABELS[s]}
                  </span>
                </li>
              ))}
            </ol>
            <div className="flex items-center gap-2">
              {statusIdx > 0 && (
                <Button variant="outline" size="sm" onClick={handleBack} loading={advancing}>
                  <ChevronLeft className="h-3.5 w-3.5" /> Back
                </Button>
              )}
              {statusIdx < INVOICE_STATUS_FLOW.length - 1 && (
                <Button size="sm" onClick={handleAdvance} loading={advancing}>
                  {INVOICE_STATUS_FLOW[statusIdx + 1] === 'collected' ? 'Mark Collected' : `Move to "${INVOICE_STATUS_LABELS[INVOICE_STATUS_FLOW[statusIdx + 1]]}"`}
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          {(issueDate || collectedDate) && (
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500">
              {issueDate && <span>Issued: <span className="font-medium text-gray-700">{issueDate}</span></span>}
              {dueDate && <span>Due: <span className="font-medium text-gray-700">{dueDate}</span></span>}
              {etaRef && <span>ETA ref: <span className="font-medium text-gray-700">{etaRef}</span></span>}
              {collectedDate && (
                <span>Collected: <span className="font-medium text-green-700">{collectedDate}
                  {invoice.collection_method ? ` (${COLLECTION_METHOD_LABELS[invoice.collection_method]})` : ''}</span></span>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Amounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-4 w-4 text-blue-600" />
            Amounts
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Gross Amount (EGP)</label>
              <input type="number" min="0" value={gross} onChange={e => setGross(e.target.value)}
                disabled={amountsLocked} className={`w-full ${inputCls}`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Withholding Tax — الخصم والإضافة (EGP)</label>
              <input type="number" min="0" value={withholding} onChange={e => setWithholding(e.target.value)}
                disabled={status === 'collected'} className={`w-full ${inputCls}`} />
              <p className="text-xs text-gray-400 mt-1">Deducted by the client at source when paying.</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">ETA Reference</label>
              <input type="text" value={etaRef} onChange={e => setEtaRef(e.target.value)}
                placeholder="e-invoice number" className={`w-full ${inputCls}`} />
            </div>
          </div>

          {/* Deductions agreed in the monthly meeting */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-700">Deductions — خصومات (agreed in the monthly meeting)</h3>
              {!amountsLocked && (
                <Button variant="outline" size="sm" onClick={addRow}>
                  <Plus className="h-3.5 w-3.5" /> Add Deduction
                </Button>
              )}
            </div>
            {rows.length === 0 ? (
              <p className="text-sm text-gray-400 border border-dashed border-gray-200 rounded-lg px-4 py-3">
                No deductions on this invoice.
              </p>
            ) : (
              <div className="overflow-x-auto border border-gray-100 rounded-lg">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="bg-gray-50/70 border-b border-gray-100">
                      <th className="text-left px-3 py-2 font-medium text-gray-600 w-56">Reason</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-600">Description</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-600 w-36">Amount</th>
                      {!amountsLocked && <th className="px-2 py-2 w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => (
                      <tr key={r.key}>
                        <td className="px-3 py-1.5">
                          <select value={r.reason} onChange={e => updateRow(r.key, { reason: e.target.value as DeductionReason })}
                            disabled={amountsLocked} className={`w-full ${inputCls}`}>
                            {(Object.keys(DEDUCTION_REASON_LABELS) as DeductionReason[]).map(k => (
                              <option key={k} value={k}>{DEDUCTION_REASON_LABELS[k]}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="text" value={r.description} onChange={e => updateRow(r.key, { description: e.target.value })}
                            disabled={amountsLocked} className={`w-full ${inputCls}`} />
                        </td>
                        <td className="px-3 py-1.5">
                          <input type="number" min="0" value={r.amount} onChange={e => updateRow(r.key, { amount: e.target.value })}
                            disabled={amountsLocked} className={`w-full text-right ${inputCls}`} />
                        </td>
                        {!amountsLocked && (
                          <td className="px-2 py-1.5 text-center">
                            <button onClick={() => removeRow(r.key)} aria-label="Remove deduction"
                              className="text-gray-400 hover:text-red-600 p-1 rounded">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {amountsLocked && status !== 'collected' && (
              <p className="text-xs text-amber-600 mt-2">
                Invoice is issued on ETA — amount changes now go through a credit note below, matching current practice.
              </p>
            )}
          </div>

          {/* Credit note — only relevant once issued */}
          {amountsLocked && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Credit Note Amount (EGP)</label>
                <input type="number" min="0" value={creditNote} onChange={e => setCreditNote(e.target.value)}
                  disabled={status === 'collected'} className={`w-full ${inputCls}`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Credit Note Reason</label>
                <input type="text" value={creditNoteReason} onChange={e => setCreditNoteReason(e.target.value)}
                  disabled={status === 'collected'} className={`w-full ${inputCls}`} />
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="bg-gray-50/70 rounded-lg px-4 py-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Gross</p>
              <p className="font-mono font-semibold text-gray-900">{formatCurrency(grossNum)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Deductions{creditNoteNum > 0 ? ' + credit note' : ''}</p>
              <p className="font-mono font-semibold text-red-600">−{formatCurrency(totalDeductions + creditNoteNum)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Net (invoice value)</p>
              <p className="font-mono font-bold text-gray-900">{formatCurrency(net)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Expected collection (after withholding)</p>
              <p className="font-mono font-bold text-blue-700">{formatCurrency(expectedCollection)}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            {status === 'draft' ? (
              <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => setDeleteConfirm(true)}>
                <Trash2 className="h-4 w-4" /> Delete Invoice
              </Button>
            ) : <span />}
            <Button onClick={handleSave} loading={saving}>Save Changes</Button>
          </div>
        </CardContent>
      </Card>

      {/* Issue on ETA */}
      <Modal open={issueModal} onClose={() => setIssueModal(false)} title="Issue on ETA — إصدار على المنظومة" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Issue Date *</label>
            <input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)}
              className={`w-full ${inputCls}`} />
            <p className="text-xs text-gray-400 mt-1">
              Due date will be set to issue date + {invoice.contract?.payment_terms_days ?? 30} days (contract terms).
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">ETA Reference (optional)</label>
            <input type="text" value={etaRef} onChange={e => setEtaRef(e.target.value)}
              placeholder="e-invoice number" className={`w-full ${inputCls}`} />
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setIssueModal(false)}>Cancel</Button>
            <Button onClick={confirmIssue} loading={advancing}>Mark as Issued</Button>
          </div>
        </div>
      </Modal>

      {/* Mark collected */}
      <Modal open={collectModal} onClose={() => setCollectModal(false)} title="Mark as Collected — تم التحصيل" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Collection Date *</label>
            <input type="date" value={collectedDate} onChange={e => setCollectedDate(e.target.value)}
              className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Method</label>
            <select value={collectionMethod} onChange={e => setCollectionMethod(e.target.value as CollectionMethod)}
              className={`w-full ${inputCls}`}>
              {(Object.keys(COLLECTION_METHOD_LABELS) as CollectionMethod[]).map(m => (
                <option key={m} value={m}>{COLLECTION_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
          <p className="text-xs text-gray-400">
            Expected collection after withholding: EGP {formatCurrency(expectedCollection)}
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setCollectModal(false)}>Cancel</Button>
            <Button onClick={confirmCollect} loading={advancing}>Mark Collected</Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteConfirm}
        title="Delete this invoice?"
        message="The draft invoice and its deduction lines will be permanently removed."
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteConfirm(false)}
      />
    </div>
  )
}
