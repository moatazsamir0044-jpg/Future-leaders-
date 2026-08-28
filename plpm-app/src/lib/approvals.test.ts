import { describe, it, expect } from 'vitest'
import { isAllowedTransition } from './approvals'
import type { WorkflowStatus } from './approvals'

const ALL: WorkflowStatus[] = ['draft', 'submitted', 'approved', 'rejected']

describe('isAllowedTransition', () => {
  it('lets a draft be submitted', () => {
    expect(isAllowedTransition('draft', 'submitted')).toBe(true)
  })

  it('refuses to approve a draft without submitting it first', () => {
    // The whole point of the workflow is that somebody submits and somebody
    // else approves; jumping the step erases that separation.
    expect(isAllowedTransition('draft', 'approved')).toBe(false)
    expect(isAllowedTransition('draft', 'rejected')).toBe(false)
  })

  it('lets a submitted sheet be approved, rejected, or withdrawn', () => {
    expect(isAllowedTransition('submitted', 'approved')).toBe(true)
    expect(isAllowedTransition('submitted', 'rejected')).toBe(true)
    expect(isAllowedTransition('submitted', 'draft')).toBe(true)
  })

  it('only lets an approved sheet be reopened to draft', () => {
    expect(isAllowedTransition('approved', 'draft')).toBe(true)
    expect(isAllowedTransition('approved', 'submitted')).toBe(false)
    expect(isAllowedTransition('approved', 'rejected')).toBe(false)
  })

  it('lets a rejected sheet be corrected and resubmitted', () => {
    expect(isAllowedTransition('rejected', 'draft')).toBe(true)
    expect(isAllowedTransition('rejected', 'submitted')).toBe(true)
    expect(isAllowedTransition('rejected', 'approved')).toBe(false)
  })

  it('treats a no-op transition as disallowed', () => {
    for (const s of ALL) expect(isAllowedTransition(s, s)).toBe(false)
  })

  it('matches the database trigger exactly', () => {
    // Mirrors enforce_workflow_transition() in
    // 20260828000001_harden_authorization_and_totals.sql. If these drift, the
    // UI will offer a button the database refuses.
    const expected: Record<WorkflowStatus, WorkflowStatus[]> = {
      draft: ['submitted'],
      submitted: ['approved', 'rejected', 'draft'],
      approved: ['draft'],
      rejected: ['draft', 'submitted'],
    }
    for (const from of ALL) {
      for (const to of ALL) {
        expect([from, to, isAllowedTransition(from, to)])
          .toEqual([from, to, expected[from].includes(to)])
      }
    }
  })
})
