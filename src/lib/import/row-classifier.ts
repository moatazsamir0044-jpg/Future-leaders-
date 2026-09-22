import { normalizeForCompare } from './normalize-arabic'
import type { RowKind } from './types'

// Best-effort keyword vocabulary for rows that aren't a worker line: an
// embedded subtotal ("اجمالي الموقع" mid-sheet, not just the final
// اجماليات row) or a non-worker cost line (site running costs mixed into
// the worker list, per the plan's confirmed messiness). This list is a
// starting point, not exhaustive — validate.ts's unmapped/unknown-row
// counts are the backstop, and this table should be widened once it's run
// against the real files and the 'unknown' bucket is inspected.
// Both 'اجمالي' (ya) and 'اجمالى' (alef maqsura) are seen in the real
// files — normalizeForCompare deliberately does not unify these two
// distinct characters (see normalize-arabic.ts), so both spellings are
// listed explicitly here, same as HEADER_ALIASES does for column headers.
const SUBTOTAL_KEYWORDS = ['اجمالي', 'اجمالى', 'إجمالي', 'مجموع', 'اجماليات'].map(normalizeForCompare)

const NON_WORKER_COST_KEYWORDS = [
  'ايجار', 'إيجار', 'صيانة', 'مصاريف', 'فاتورة', 'كهرباء', 'مياه', 'أدوات', 'ادوات',
].map(normalizeForCompare)

export interface ClassifyRowInput {
  workerNumber: string | null
  workerName: string | null
  /** Every other raw cell text in the row, mapped or not — a descriptive
   * label like "اجمالي الشهر" can land in an unmapped column just as often
   * as in the name column. */
  otherRowTexts: string[]
}

/**
 * Classifies a row into worker / subtotal / non_worker_cost / unknown.
 * A row is NEVER excluded because it couldn't be classified — an empty
 * worker_number with no matching keyword becomes 'unknown' and is still
 * imported with its full raw_row intact.
 */
export function classifyRow(input: ClassifyRowInput): RowKind {
  const hasWorkerNumber = !!(input.workerNumber && input.workerNumber.trim() !== '')
  if (hasWorkerNumber) return 'worker'

  const haystack = normalizeForCompare(
    [input.workerName ?? '', ...input.otherRowTexts].filter(Boolean).join(' '),
  )

  if (SUBTOTAL_KEYWORDS.some((keyword) => haystack.includes(keyword))) return 'subtotal'
  if (NON_WORKER_COST_KEYWORDS.some((keyword) => haystack.includes(keyword))) return 'non_worker_cost'

  return 'unknown'
}
