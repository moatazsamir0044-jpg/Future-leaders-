/**
 * Read a monthly payroll workbook (one worksheet per site).
 *
 * These rules were derived from - and checked against - the May, June and July
 * 2026 workbooks of both companies. They matter, because each one corresponds
 * to a way a sheet can quietly produce wrong payroll:
 *
 *  - Columns are read BY POSITION, but the Arabic header sitting at each
 *    position must be one this file recognises. Sites word the leave columns a
 *    dozen different ways ("اجازت سنوي", "اجازت اعياد", "اضافي عيد", ...), so
 *    matching on text alone is unreliable, and trusting position alone would
 *    silently file one column's numbers under another. A header we do not
 *    recognise fails the sheet instead of guessing.
 *  - The header row REPEATS partway down a sheet, at print-page breaks. Read
 *    naively those rows become a worker literally named "الاسم".
 *  - Groups of workers are followed by a sub-total row carrying the group name
 *    (a building, a transport route, a shift). Those rows are not workers, and
 *    some of them leak the group name into the name column.
 *  - Every sheet prints its own totals. We add up what we parsed and compare;
 *    a sheet that does not reconcile is reported rather than imported.
 */
import ExcelJS from 'exceljs'

export interface WorkerRow {
  rowNumber: number
  workerNumber: number | null
  employeeName: string
  section: string | null
  values: Record<NumericField, number>
}

export interface SheetResult {
  sheetName: string
  title: string
  rows: WorkerRow[]
  /** totals the sheet itself prints at the bottom, when it has them */
  printedNet: number | null
  printedGross: number | null
  ourNet: number
  ourGross: number
  /** anything that makes this sheet unsafe to import */
  errors: string[]
  /** worth showing, but not blocking */
  warnings: string[]
}

export interface WorkbookResult {
  sheets: SheetResult[]
  /** months named in the sheet titles, for defaulting the period picker */
  monthsSeen: number[]
}

export type NumericField =
  | 'net_salary' | 'total_gross' | 'bonuses' | 'transportation_amount'
  | 'transportation_category' | 'advance' | 'deductions' | 'insurance'
  | 'daily_wage' | 'base_monthly_salary' | 'net_days' | 'absence_days'
  | 'holiday_extra_days' | 'penalties' | 'less_hours' | 'overtime_hours'
  | 'absence_no_permission' | 'annual_leave_days' | 'monthly_leave_days'
  | 'attendance_days'

/** column position -> field, and the header spellings accepted there */
const LAYOUT: { col: number; field: NumericField | 'worker_number' | 'employee_name' | null; aliases: string[] }[] = [
  { col: 1, field: 'worker_number', aliases: ['رقم العامل'] },
  { col: 2, field: null, aliases: ['التوقيع'] },
  { col: 3, field: 'net_salary', aliases: ['صافي الراتب'] },
  { col: 4, field: 'total_gross', aliases: ['الاجمالي'] },
  { col: 5, field: 'bonuses', aliases: ['مكافاءت'] },
  { col: 6, field: 'transportation_amount', aliases: ['مواصلات'] },
  { col: 7, field: 'transportation_category', aliases: ['فئه المواصلات'] },
  { col: 8, field: 'advance', aliases: ['سلف'] },
  { col: 9, field: 'deductions', aliases: ['استقطاعات'] },
  { col: 10, field: 'insurance', aliases: ['تامينات'] },
  { col: 11, field: 'daily_wage', aliases: ['الاجر اليومي'] },
  { col: 12, field: 'base_monthly_salary', aliases: ['الراتب الشهري'] },
  { col: 13, field: 'net_days', aliases: ['صافي الايام'] },
  { col: 14, field: 'absence_days', aliases: ['الغياب'] },
  { col: 15, field: 'holiday_extra_days', aliases: ['اضافي', 'اضافي عيد ورسمي', 'اضافي عيد وا رسمي'] },
  { col: 16, field: 'penalties', aliases: ['جزاءات', 'خصم'] },
  { col: 17, field: 'less_hours', aliases: ['ساعات اقل'] },
  { col: 18, field: 'overtime_hours', aliases: ['ساعات اضافي', 'اضافي عيد'] },
  { col: 19, field: 'absence_no_permission', aliases: ['غياب بدون اذن'] },
  {
    col: 20, field: 'annual_leave_days', aliases: [
      'اجازت عيد وسنوي', 'اجازت سنوي', 'اجازت اعياد', 'اضافي عيد', 'اجازت سنوي وعيد',
      'اجازت سنوي ورسمي', 'اجازت سنوي وعيد اضافي', 'اجازت سنوي واضفي عيد', 'اجازه عيد',
      'اجازه سنوي', 'اضافي عيد+عيد عمال', 'اجازات اعياد', 'اضافه عيد',
    ],
  },
  { col: 21, field: 'monthly_leave_days', aliases: ['اجازات شهري', 'اجازات شهري ورسمي', 'اجازات شهري ورسميه'] },
  { col: 22, field: 'attendance_days', aliases: ['عدد ايام حضور'] },
  { col: 23, field: 'employee_name', aliases: ['الاسم'] },
  { col: 24, field: null, aliases: ['رقم العامل'] },
]

export const NUMERIC_FIELDS = LAYOUT
  .map(l => l.field)
  .filter((f): f is NumericField => !!f && f !== 'worker_number' && f !== 'employee_name')

const NAME_COL = 23
const NUM_COL = 1
const NET_COL = 3
const GROSS_COL = 4
const SECTION_LABEL_COL = 21
const SECTION_NET_LABEL_COL = 16
const SECTION_GROSS_LABEL_COL = 19

/** sheets that summarise rather than list workers */
const SKIP_SHEETS = ['Total', 'مقارنه']

const MONTH_NAMES: Record<number, string[]> = {
  1: ['يناير'], 2: ['فبراير'], 3: ['مارس'], 4: ['ابريل', 'أبريل'], 5: ['مايو'],
  6: ['يونيو', 'يونيه'], 7: ['يوليو', 'يوليه'], 8: ['اغسطس', 'أغسطس'],
  9: ['سبتمبر'], 10: ['اكتوبر', 'أكتوبر'], 11: ['نوفمبر'], 12: ['ديسمبر'],
}

/** Normalise Arabic so spelling variants of the same header compare equal. */
export function norm(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
    .normalize('NFKC')
    .replace(/ـ/g, '')          // tatweel
    .replace(/[ً-ْ]/g, '') // harakat
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim()
}

/** A cell's number, or null when it holds text (which marks a non-worker row). */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'number') return value
  const text = String(value).trim().replace(/,/g, '').replace(/٬/g, '')
  if (text === '' || text === '-' || text === '—') return 0
  const n = Number(text)
  return Number.isFinite(n) ? n : null
}

/**
 * The value behind a cell.
 *
 * Formula cells arrive as objects carrying Excel's cached result - except that
 * Excel omits that cached result when the computed value is zero, so a formula
 * object with no `result` means zero. Getting this wrong makes every row
 * containing a zero formula look like text rather than payroll.
 */
function cellValue(row: ExcelJS.Row, col: number): unknown {
  const v = row.getCell(col).value
  if (v === null || typeof v !== 'object') return v
  if (v instanceof Date) return v
  if ('error' in v) return v                       // #REF! and friends: not a number
  if ('richText' in v) {
    return (v as { richText: { text: string }[] }).richText.map(t => t.text).join('')
  }
  if ('formula' in v || 'sharedFormula' in v) {
    return 'result' in v ? (v as { result: unknown }).result : 0
  }
  return v
}

function isHeaderRow(row: ExcelJS.Row): boolean {
  return norm(cellValue(row, NAME_COL)) === 'الاسم'
}

/** Check the header sits where we expect. Returns the problems found. */
function validateHeader(row: ExcelJS.Row): string[] {
  const problems: string[] = []
  for (const { col, field, aliases } of LAYOUT) {
    const text = norm(cellValue(row, col))
    if (text === '') continue
    if (!aliases.includes(text)) {
      problems.push(`column ${col} is headed "${text}", which is not a heading this import recognises for ${field ?? 'this column'}`)
    }
  }
  return problems
}

/** A sub-total row for a group, carrying the group's name. */
function sectionLabel(row: ExcelJS.Row): string | null {
  const netLabel = norm(cellValue(row, SECTION_NET_LABEL_COL))
  const grossLabel = norm(cellValue(row, SECTION_GROSS_LABEL_COL))
  const looksLikeSubtotal =
    netLabel === 'صافي' || netLabel === 'الصافي' ||
    grossLabel === 'اجمالي' || grossLabel === 'الاجمالي'
  if (!looksLikeSubtotal) return null
  const raw = cellValue(row, SECTION_LABEL_COL)
  if (raw === null || raw === undefined || String(raw).trim() === '') return null
  if (num(raw) !== null) return null   // a number is not a group name
  return String(raw).replace(/\s+/g, ' ').trim()
}

function parseSheet(ws: ExcelJS.Worksheet): SheetResult {
  const result: SheetResult = {
    sheetName: ws.name,
    title: '',
    rows: [],
    printedNet: null,
    printedGross: null,
    ourNet: 0,
    ourGross: 0,
    errors: [],
    warnings: [],
  }

  const firstRow = ws.getRow(1)
  const titleParts: string[] = []
  firstRow.eachCell(cell => {
    const v = cellValue(firstRow, Number(cell.col))
    if (v !== null && v !== undefined && String(v).trim() !== '') titleParts.push(String(v).trim())
  })
  result.title = titleParts.join(' ')

  // find the header
  let headerRow = 0
  for (let r = 1; r <= ws.rowCount; r++) {
    if (isHeaderRow(ws.getRow(r))) { headerRow = r; break }
  }
  if (headerRow === 0) {
    let populated = 0
    for (let r = 1; r <= ws.rowCount; r++) {
      if (ws.getRow(r).actualCellCount > 0) populated++
    }
    if (populated > 0) {
      result.errors.push('this sheet has content but no recognisable table heading')
    }
    return result
  }

  result.errors.push(...validateHeader(ws.getRow(headerRow)))

  // walk the rows, collecting workers and applying each group label backwards
  let pending: WorkerRow[] = []
  for (let r = headerRow + 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r)
    if (row.actualCellCount === 0) continue
    if (isHeaderRow(row)) {
      // header repeated at a page break
      result.errors.push(...validateHeader(row).map(p => `repeated heading on row ${r}: ${p}`))
      continue
    }

    const label = sectionLabel(row)
    if (label !== null) {
      for (const w of pending) w.section = label
      pending = []
      continue
    }

    const rawName = cellValue(row, NAME_COL)
    const name = rawName === null || rawName === undefined ? '' : String(rawName).trim()
    if (name === '') {
      // no name: a spacer, or the grand-total line
      const net = num(cellValue(row, NET_COL))
      const gross = num(cellValue(row, GROSS_COL))
      if (net !== null && gross !== null && (net !== 0 || gross !== 0)) {
        result.printedNet = net
        result.printedGross = gross
      }
      continue
    }

    // text sitting in a numeric column means this is an annotation, not a worker
    const textual = LAYOUT.some(({ col, field }) =>
      field && field !== 'employee_name' && num(cellValue(row, col)) === null)
    if (textual) continue

    const values = {} as Record<NumericField, number>
    for (const { col, field } of LAYOUT) {
      if (!field || field === 'employee_name' || field === 'worker_number') continue
      values[field] = round2(num(cellValue(row, col)) ?? 0)
    }
    const wn = num(cellValue(row, NUM_COL))
    pending.push({
      rowNumber: r,
      workerNumber: wn === null || wn === 0 ? null : Math.trunc(wn),
      employeeName: name,
      section: null,
      values,
    })
    result.rows.push(pending[pending.length - 1])
  }

  result.ourNet = round2(result.rows.reduce((s, w) => s + w.values.net_salary, 0))
  result.ourGross = round2(result.rows.reduce((s, w) => s + w.values.total_gross, 0))

  if (result.rows.length > 0) {
    if (result.printedNet === null || result.printedGross === null) {
      result.warnings.push('this sheet prints no total, so the rows could not be cross-checked against it')
    } else {
      // rows are stored to 2 decimals while the sheet totals at full precision,
      // so allow a few piastres before calling it a mismatch
      const tolerance = Math.max(1, result.rows.length * 0.01)
      if (Math.abs(result.ourNet - result.printedNet) > tolerance) {
        result.errors.push(
          `the rows add up to ${result.ourNet.toFixed(2)} net but the sheet's own total says ` +
          `${result.printedNet.toFixed(2)} - a row may be missing or counted twice`)
      }
      if (Math.abs(result.ourGross - result.printedGross) > tolerance) {
        result.errors.push(
          `the rows add up to ${result.ourGross.toFixed(2)} gross but the sheet's own total says ` +
          `${result.printedGross.toFixed(2)}`)
      }
    }
  }

  return result
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Month named in a sheet title, if any. Titles are often stale, so this is
 *  only used to suggest a period - never to decide one. */
function monthFromTitle(title: string): number | null {
  const t = norm(title)
  for (const [m, names] of Object.entries(MONTH_NAMES)) {
    if (names.some(n => t.includes(norm(n)))) return Number(m)
  }
  return null
}

export async function readPayrollWorkbook(data: ArrayBuffer): Promise<WorkbookResult> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(data)

  const sheets: SheetResult[] = []
  const monthsSeen = new Set<number>()

  wb.eachSheet(ws => {
    if (SKIP_SHEETS.includes(ws.name)) return
    const parsed = parseSheet(ws)
    // a sheet with no workers and nothing wrong is simply unused this month
    if (parsed.rows.length === 0 && parsed.errors.length === 0) return
    const m = monthFromTitle(parsed.title)
    if (m) monthsSeen.add(m)
    sheets.push(parsed)
  })

  return { sheets, monthsSeen: [...monthsSeen].sort((a, b) => a - b) }
}
