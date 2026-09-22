import { normalizeForCompare } from './normalize-arabic'
import type { CanonicalField, ColumnMapping, DetectedHeader } from './types'

// Confirmed Arabic column-label vocabulary. Values marked "real export"
// below come straight from src/lib/export/excel.ts's payroll column header
// row, which reflects labels this business has actually used. The rest are
// reasonable spelling variants to absorb without over-fitting to files we
// have not parsed yet — validate.ts's unmapped-header report is the
// backstop for anything this table doesn't yet cover.
//
// annual_leave_days deliberately absorbs all three spellings the plan
// confirmed by direct inspection of the real files: اجازه سنوي, اجازت اعياد,
// اجازت سنوى. These are NOT three different kinds of leave — they are the
// same column, spelled differently sheet to sheet (see leave_label_raw on
// pv_payroll_lines).
//
// Because mapping is driven entirely by header TEXT (never by column
// position), a sheet with a different column order — such as the standalone
// Futtaim file — is handled by this same table with no special-casing: the
// header search just finds each label wherever it happens to sit in that
// sheet's row.
export const HEADER_ALIASES: Record<CanonicalField, string[]> = {
  worker_number: ['رقم العامل', 'رقم', 'الرقم', 'كود العامل', 'كود'],
  worker_name: ['الاسم', 'اسم العامل', 'اسم الموظف', 'الأسم'],
  // real export: 'عدد أيام الحضور'
  attendance_days: ['عدد أيام الحضور', 'ايام الحضور', 'أيام الحضور', 'الحضور'],
  // real export: 'الغياب'
  absence_days: ['الغياب', 'ايام الغياب', 'أيام الغياب'],
  // real export: 'صافى الايام'
  net_days: ['صافى الايام', 'صافي الايام', 'الايام الصافية', 'صافى الأيام'],
  // real export: 'اجازات شهرى'
  monthly_leave_days: ['اجازات شهرى', 'اجازات شهري', 'اجازة شهرية', 'الاجازة الشهرية', 'اجازات شهريه'],
  // real export: 'اجازه سنوي' — plus the two other drifted spellings
  // confirmed present in the real files.
  annual_leave_days: [
    'اجازه سنوي', 'اجازت اعياد', 'اجازت سنوى',
    'اجازة سنوية', 'اجازات سنوية', 'اجازه سنويه',
  ],
  // real export: 'غياب بدون اذن'
  absence_no_permission_days: ['غياب بدون اذن', 'غياب بدون إذن'],
  // real export: 'ساعات اضافى'
  overtime_hours: ['ساعات اضافى', 'ساعات اضافي', 'اضافى', 'اضافي', 'ساعات إضافية'],
  // real export: 'ساعات اقل'
  less_hours: ['ساعات اقل', 'ساعات أقل', 'نقص ساعات', 'خصم ساعات'],
  // real export: 'الراتب الشهرى'
  base_monthly_salary: ['الراتب الشهرى', 'الراتب الشهري', 'المرتب الاساسى', 'المرتب الاساسي', 'الراتب الاساسي'],
  // real export: 'الاجر اليومى'
  daily_wage: ['الاجر اليومى', 'الاجر اليومي', 'الأجر اليومي', 'يومية العامل'],
  // real export: 'مكافاءت'
  bonuses: ['مكافاءت', 'مكافآت', 'حوافز', 'مكافأة'],
  // real export: 'مواصلات'
  transportation_amount: ['مواصلات', 'بدل انتقال', 'بدل مواصلات'],
  // real export: 'فئة المواصلات'
  transportation_category: ['فئة المواصلات', 'فئة الانتقال', 'نوع المواصلات'],
  // real export: 'سلف'
  advance: ['سلف', 'سلفة', 'سلفه'],
  // real export: 'استقطاعات'
  deductions: ['استقطاعات', 'خصومات', 'خصم'],
  // real export: 'تامينات'
  insurance: ['تامينات', 'تأمينات', 'تأمين'],
  // real export: 'الاجمالى'
  total_gross: ['الاجمالى', 'الاجمالي', 'إجمالي', 'اجمالى الراتب'],
  // real export: 'صافى الراتب'
  net_salary: ['صافى الراتب', 'صافي الراتب', 'الصافي'],
  // real export: 'التوقيع'
  signature_notes: ['التوقيع', 'توقيع', 'ملاحظات'],
}

// Reverse lookup, built once: normalized alias text -> canonical field.
// Longer/more specific aliases are registered so an exact normalized match
// wins; column-mapping never does fuzzy/substring matching on headers
// (unlike end-of-sheet's اجماليات detection) because header labels are
// short and a substring match risks false positives (e.g. 'اجازه سنوي'
// substring-matching a totals label).
const ALIAS_LOOKUP: Map<string, CanonicalField> = new Map()
for (const [field, aliases] of Object.entries(HEADER_ALIASES) as Array<
  [CanonicalField, string[]]
>) {
  for (const alias of aliases) {
    ALIAS_LOOKUP.set(normalizeForCompare(alias), field)
  }
}

/**
 * Maps each detected header to a canonical field by exact normalized text
 * match. Headers that don't match anything in HEADER_ALIASES are returned
 * in `unmappedHeaders` — never dropped, since their raw values still reach
 * `raw_row` on every line (see normalize-row.ts / parse-workbook.ts).
 */
export function buildColumnMapping(headers: DetectedHeader[]): ColumnMapping {
  const fieldsByColumn = new Map<number, CanonicalField>()
  const unmappedHeaders: DetectedHeader[] = []
  let annualLeaveHeaderText: string | null = null

  for (const header of headers) {
    const key = normalizeForCompare(header.rawText)
    if (!key) continue // a genuinely blank header cell isn't "unmapped", just absent

    const field = ALIAS_LOOKUP.get(key)
    if (!field) {
      unmappedHeaders.push(header)
      continue
    }

    fieldsByColumn.set(header.columnIndex, field)
    if (field === 'annual_leave_days') {
      annualLeaveHeaderText = header.rawText.trim()
    }
  }

  return { fieldsByColumn, unmappedHeaders, annualLeaveHeaderText }
}
