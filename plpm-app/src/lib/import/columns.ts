import { normalizeKey } from './arabic'

/**
 * Every payroll_records column an imported sheet can fill.
 *
 * `employee_id` is deliberately absent: the roster table is empty in
 * production and sheets carry no stable worker identity, so imported rows are
 * stored exactly as the manual "Add Employee" form stores them — by name and
 * worker number, with a null employee_id.
 */
export const NUMERIC_FIELDS = [
  'attendance_days',
  'absence_days',
  'net_days',
  'monthly_leave_days',
  'annual_leave_days',
  'absence_no_permission',
  'holiday_extra_days',
  'overtime_hours',
  'less_hours',
  'base_monthly_salary',
  'daily_wage',
  'bonuses',
  'transportation_amount',
  'transportation_category',
  'advance',
  'insurance',
  'deductions',
  'penalties',
  'total_gross',
  'net_salary',
] as const

export type NumericField = typeof NUMERIC_FIELDS[number]
export type SheetField = NumericField | 'worker_number' | 'employee_name'

/**
 * Columns a sheet must have before we will import it at all.
 *
 * The two money columns are required because the importer never derives them:
 * production data shows the sites' own arithmetic does not follow one shared
 * formula, so the sheet's figures are the only correct source.
 */
export const REQUIRED_FIELDS: SheetField[] = ['employee_name', 'total_gross', 'net_salary']

/**
 * Header spellings seen across the site sheets, plus the English headings the
 * mixed-language sheets use. Matched after normalizeKey(), so diacritics,
 * alef/ya/ta-marbuta variants and punctuation differences are already handled
 * and don't need their own entries here.
 */
const ALIASES: Record<SheetField, string[]> = {
  worker_number: ['رقم العامل', 'رقم', 'م', 'مسلسل', 'كود', 'الكود', 'رقم الموظف', 'no', 'no.', '#', 'code', 'id', 'serial'],
  employee_name: ['الاسم', 'اسم العامل', 'اسم الموظف', 'الاسم بالكامل', 'اسم', 'name', 'employee name', 'employee'],
  attendance_days: ['عدد ايام الحضور', 'ايام الحضور', 'عدد الايام', 'الحضور', 'ايام العمل', 'attendance', 'attendance days', 'present days'],
  absence_days: ['الغياب', 'ايام الغياب', 'غياب', 'absence', 'absent days'],
  net_days: ['صافي الايام', 'صافي ايام', 'الايام الصافيه', 'net days', 'paid days'],
  monthly_leave_days: ['اجازات شهري', 'اجازه شهري', 'اجازة شهرية', 'الاجازه الشهريه', 'monthly leave'],
  annual_leave_days: ['اجازه سنوي', 'اجازات سنوي', 'اجازة سنوية', 'الاجازه السنويه', 'annual leave'],
  absence_no_permission: ['غياب بدون اذن', 'بدون اذن', 'غياب بدون إذن', 'absence without permission', 'unauthorised absence'],
  holiday_extra_days: ['ايام الاجازات الرسميه', 'اجازات رسميه', 'بدل راحه', 'ايام اضافيه', 'holiday extra days', 'extra days'],
  overtime_hours: ['ساعات اضافي', 'اضافي', 'ساعات اضافيه', 'الاضافي', 'overtime', 'overtime hours', 'ot'],
  less_hours: ['ساعات اقل', 'اقل', 'ساعات ناقصه', 'less hours', 'shortage hours'],
  penalties: ['جزاءات', 'جزاء', 'الجزاءات', 'خصم جزاءات', 'penalties', 'penalty'],
  base_monthly_salary: ['الراتب الشهري', 'المرتب الشهري', 'الراتب', 'المرتب', 'الاساسي', 'اساسي', 'monthly salary', 'basic salary', 'salary'],
  daily_wage: ['الاجر اليومي', 'اليومي', 'الاجر', 'يوميه', 'daily wage', 'daily rate'],
  insurance: ['تامينات', 'التامينات', 'تامين', 'insurance', 'social insurance'],
  transportation_category: ['فئة المواصلات', 'فئه المواصلات', 'فئة الانتقالات', 'transport category', 'transportation category'],
  transportation_amount: ['مواصلات', 'بدل مواصلات', 'الانتقالات', 'انتقالات', 'بدل انتقال', 'transportation', 'transport', 'transport allowance'],
  bonuses: ['مكافاءت', 'مكافات', 'مكافاه', 'حوافز', 'حافز', 'منح', 'bonus', 'bonuses', 'incentive'],
  advance: ['سلف', 'السلف', 'سلفه', 'سلفة', 'advance', 'advances', 'loan'],
  deductions: ['استقطاعات', 'خصومات', 'خصم', 'الخصومات', 'استقطاع', 'deductions', 'deduction'],
  total_gross: ['الاجمالي', 'اجمالي المستحق', 'اجمالي الراتب', 'الاجمالي المستحق', 'المستحق', 'gross', 'total gross', 'gross total', 'total'],
  net_salary: ['صافي الراتب', 'الصافي', 'صافي المرتب', 'صافي المستحق', 'net', 'net salary', 'net pay'],
}

/** Headings that legitimately appear and carry no data we store. */
const IGNORED = ['التوقيع', 'توقيع', 'signature', 'ملاحظات', 'notes', 'remarks', 'البصمه', 'الوظيفه', 'المسمي الوظيفي', 'job title', 'position']

interface AliasEntry { field: SheetField; key: string }

const EXACT = new Map<string, SheetField>()
const CONTAINS: AliasEntry[] = []

for (const [field, spellings] of Object.entries(ALIASES) as [SheetField, string[]][]) {
  for (const spelling of spellings) {
    const key = normalizeKey(spelling)
    if (!key) continue
    // First writer wins: aliases are listed most-specific first within a field,
    // and a key claimed by an earlier field is never silently reassigned.
    if (!EXACT.has(key)) EXACT.set(key, field)
    CONTAINS.push({ field, key })
  }
}
// Longest alias first, so "فئة المواصلات" is tested before "مواصلات" and a
// transport-category column can never be read as the transport amount.
CONTAINS.sort((a, b) => b.key.length - a.key.length)

const IGNORED_KEYS = new Set(IGNORED.map(normalizeKey))

export interface ColumnMap {
  /** field -> zero-based column index within the row. */
  byField: Partial<Record<SheetField, number>>
  /** Header cells that matched nothing — surfaced in review, never guessed at. */
  unmatched: { index: number; text: string }[]
  /** How many distinct fields were identified. */
  matchCount: number
}

/**
 * Try to read a row as a header row.
 *
 * Matching is two-pass: every cell gets a chance at an exact alias match
 * before any cell is allowed a substring match, so a precise heading is never
 * beaten to its field by a vaguer neighbour.
 */
export function detectColumns(cells: string[]): ColumnMap {
  const byField: Partial<Record<SheetField, number>> = {}
  const claimed = new Set<number>()
  const keys = cells.map(normalizeKey)

  keys.forEach((key, i) => {
    if (!key || claimed.has(i)) return
    if (IGNORED_KEYS.has(key)) { claimed.add(i); return }
    const field = EXACT.get(key)
    if (field && byField[field] === undefined) {
      byField[field] = i
      claimed.add(i)
    }
  })

  keys.forEach((key, i) => {
    if (!key || claimed.has(i)) return
    for (const { field, key: alias } of CONTAINS) {
      if (byField[field] !== undefined) continue
      // Require a word-ish boundary so "م" (serial) cannot match inside "الاسم".
      if (key === alias || key.startsWith(alias + ' ') || key.endsWith(' ' + alias) || key.includes(' ' + alias + ' ')) {
        byField[field] = i
        claimed.add(i)
        return
      }
    }
  })

  const unmatched = cells
    .map((text, index) => ({ index, text: text.trim() }))
    .filter(c => c.text !== '' && !claimed.has(c.index) && !IGNORED_KEYS.has(normalizeKey(c.text)))

  return { byField, unmatched, matchCount: Object.keys(byField).length }
}

/**
 * A row is the header when it names the employee column plus enough other
 * known fields that it cannot be a data row that happens to hold text.
 */
export function looksLikeHeader(map: ColumnMap): boolean {
  return map.byField.employee_name !== undefined && map.matchCount >= 4
}

const TOTAL_KEYS = [
  'الاجمالي', 'اجمالي', 'المجموع', 'مجموع', 'الاجمالي الكلي', 'اجمالي الموقع',
  'total', 'totals', 'grand total', 'sum', 'sub total', 'subtotal',
].map(normalizeKey)

/** True when a cell's text marks the row as a totals/subtotal row. */
export function isTotalLabel(text: string): boolean {
  const key = normalizeKey(text)
  if (!key) return false
  return TOTAL_KEYS.some(t => key === t || key.startsWith(t + ' ') || key.endsWith(' ' + t))
}

export const MISSING_FIELD_LABELS: Record<SheetField, string> = {
  worker_number: 'رقم العامل (worker number)',
  employee_name: 'الاسم (employee name)',
  attendance_days: 'عدد أيام الحضور (attendance days)',
  absence_days: 'الغياب (absence days)',
  net_days: 'صافى الايام (net days)',
  monthly_leave_days: 'اجازات شهرى (monthly leave)',
  annual_leave_days: 'اجازه سنوي (annual leave)',
  absence_no_permission: 'غياب بدون اذن (absence without permission)',
  holiday_extra_days: 'ايام اضافية (holiday extra days)',
  overtime_hours: 'ساعات اضافى (overtime hours)',
  less_hours: 'ساعات اقل (less hours)',
  penalties: 'جزاءات (penalties)',
  base_monthly_salary: 'الراتب الشهرى (monthly salary)',
  daily_wage: 'الاجر اليومى (daily wage)',
  insurance: 'تامينات (insurance)',
  transportation_category: 'فئة المواصلات (transport category)',
  transportation_amount: 'مواصلات (transport allowance)',
  bonuses: 'مكافاءت (bonuses)',
  advance: 'سلف (advance)',
  deductions: 'استقطاعات (deductions)',
  total_gross: 'الاجمالى (gross total)',
  net_salary: 'صافى الراتب (net salary)',
}
