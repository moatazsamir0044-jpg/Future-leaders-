import { createClient } from '@/lib/supabase/client'

export type ApprovalEntity = 'payroll' | 'expense'
export type WorkflowStatus = 'draft' | 'submitted' | 'approved' | 'rejected'

const TABLES: Record<ApprovalEntity, string> = {
  payroll: 'payroll_periods',
  expense: 'expense_reports',
}

/**
 * Single place that moves a payroll sheet or expense report through the
 * workflow: sets the status, maintains the audit fields, and writes the
 * approval log. Returns an error message or null on success.
 */
export async function updateApprovalStatus(
  entity: ApprovalEntity,
  id: string,
  newStatus: WorkflowStatus,
  notes?: string,
): Promise<string | null> {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const now = new Date().toISOString()

  const updates: Record<string, unknown> = { status: newStatus }
  if (newStatus === 'submitted') {
    updates.submitted_by = user?.id ?? null
    updates.submitted_at = now
  }
  if (newStatus === 'approved') {
    updates.approved_by = user?.id ?? null
    updates.approved_at = now
    updates.rejection_notes = null
  }
  if (newStatus === 'rejected' && notes) updates.rejection_notes = notes
  if (newStatus === 'draft') {
    updates.submitted_by = null
    updates.submitted_at = null
    updates.approved_by = null
    updates.approved_at = null
    updates.rejection_notes = null
  }

  const { error } = await supabase.from(TABLES[entity]).update(updates).eq('id', id)
  if (error) return error.message

  if (user) {
    await supabase.from('approval_logs').insert({
      entity_type: entity,
      entity_id: id,
      action: newStatus === 'draft' ? 'reset_to_draft' : newStatus,
      performed_by: user.id,
      notes: notes ?? null,
    })
  }
  return null
}
