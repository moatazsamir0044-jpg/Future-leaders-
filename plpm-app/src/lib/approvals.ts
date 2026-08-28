import { createClient } from '@/lib/supabase/client'
import { applyPayrollAdvanceRepayments, revertPayrollAdvanceRepayments } from '@/lib/advances'

export type ApprovalEntity = 'payroll' | 'expense'
export type WorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

const TABLES: Record<ApprovalEntity, string> = {
  payroll: 'payroll_periods',
  expense: 'expense_reports',
}

// Mirrors enforce_workflow_transition() in the database. The database is the
// authority — this copy exists only to fail fast with a readable message
// instead of surfacing a raw Postgres error.
const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'draft'],
  approved: ['draft'],
  rejected: ['draft', 'submitted'],
}

export function isAllowedTransition(from: WorkflowStatus, to: WorkflowStatus): boolean {
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false
}

/**
 * Single place that moves a payroll sheet or expense report through the
 * workflow: sets the status, keeps the advance ledger in step, and writes the
 * approval log. Returns an error message, or null on success.
 *
 * The audit columns (submitted_by/at, approved_by/at) are deliberately not
 * sent — a database trigger stamps them from the authenticated session, so a
 * client cannot claim someone else approved a sheet.
 */
export async function updateApprovalStatus(
  entity: ApprovalEntity,
  id: string,
  newStatus: WorkflowStatus,
  notes?: string,
  currentStatus?: WorkflowStatus,
): Promise<string | null> {
  if (currentStatus && !isAllowedTransition(currentStatus, newStatus)) {
    return `Cannot move a ${currentStatus} record straight to ${newStatus}.`
  }

  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'rejected' && notes) updates.rejection_notes = notes

  const { error } = await supabase.from(TABLES[entity]).update(updates).eq('id', id)
  if (error) return error.message

  // The status change has happened. Everything below is follow-up work whose
  // failure is reported but must not swallow the audit entry, so the log is
  // written first and the ledger error is collected rather than returned early.
  let followUpError: string | null = null

  if (user) {
    const { error: logError } = await supabase.from('approval_logs').insert({
      entity_type: entity,
      entity_id: id,
      action: newStatus === 'draft' ? 'reset_to_draft' : newStatus,
      notes: notes ?? null,
    })
    if (logError) followUpError = `Status updated, but the approval log entry failed: ${logError.message}`
  }

  // Keep the advance ledger in sync with payroll approvals: approving a sheet
  // records its advance deductions as repayments; reopening it reverts them.
  if (entity === 'payroll') {
    if (newStatus === 'approved') {
      const ledgerErr = await applyPayrollAdvanceRepayments(id)
      if (ledgerErr) followUpError = `Approved, but advance repayments could not be recorded: ${ledgerErr}`
    }
    if (newStatus === 'draft') {
      const ledgerErr = await revertPayrollAdvanceRepayments(id)
      if (ledgerErr) followUpError = `Reset to draft, but advance repayments could not be reverted: ${ledgerErr}`
    }
  }

  return followUpError
}
