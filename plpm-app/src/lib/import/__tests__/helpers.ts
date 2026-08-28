import ExcelJS from 'exceljs'

/** The 22 headings the site sheets and the app's own export both use. */
export const STANDARD_HEADERS = [
  'رقم العامل', 'الاسم', 'عدد أيام الحضور', 'اجازات شهرى', 'اجازه سنوي', 'غياب بدون اذن',
  'ساعات اضافى', 'ساعات اقل', 'جزاءات', 'الراتب الشهرى', 'الاجر اليومى', 'صافى الايام',
  'الغياب', 'تامينات', 'فئة المواصلات', 'مواصلات', 'مكافاءت', 'سلف', 'استقطاعات',
  'الاجمالى', 'صافى الراتب', 'التوقيع',
]

export type Cell = string | number | null | undefined | { formula: string; result?: unknown } | { error: string }

export interface SheetSpec {
  name: string
  rows: Cell[][]
}

/** Build a real .xlsx in memory from literal cell values. */
export async function buildWorkbook(sheets: SheetSpec[]): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook()
  for (const spec of sheets) {
    const ws = wb.addWorksheet(spec.name)
    for (const row of spec.rows) {
      ws.addRow(row as ExcelJS.CellValue[])
    }
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer
}

/**
 * A worker row in standard column order.
 * Defaults mirror a plausible sheet line so tests only state what they vary.
 */
export function workerRow(over: Partial<{
  no: Cell; name: string; attendance: Cell; monthlyLeave: Cell; annualLeave: Cell
  noPermission: Cell; overtime: Cell; lessHours: Cell; penalties: Cell; salary: Cell
  daily: Cell; netDays: Cell; absence: Cell; insurance: Cell; transportCat: Cell
  transport: Cell; bonuses: Cell; advance: Cell; deductions: Cell; gross: Cell; net: Cell
}> = {}): Cell[] {
  const d = {
    no: 1, name: 'محمد أحمد على', attendance: 26, monthlyLeave: 0, annualLeave: 0,
    noPermission: 0, overtime: 0, lessHours: 0, penalties: 0, salary: 4000,
    daily: 129.03, netDays: 26, absence: 0, insurance: 440, transportCat: 1,
    transport: 250, bonuses: 0, advance: 0, deductions: 0, gross: 3604.78, net: 3164.78,
    ...over,
  }
  return [
    d.no, d.name, d.attendance, d.monthlyLeave, d.annualLeave, d.noPermission,
    d.overtime, d.lessHours, d.penalties, d.salary, d.daily, d.netDays,
    d.absence, d.insurance, d.transportCat, d.transport, d.bonuses, d.advance,
    d.deductions, d.gross, d.net, '',
  ]
}

/** A totals row in the shape the sheets use: label in the name column. */
export function totalsRow(gross: Cell, net: Cell, label = 'الاجمالى'): Cell[] {
  const row: Cell[] = new Array(22).fill('')
  row[1] = label
  row[19] = gross
  row[20] = net
  return row
}

/** The two title lines that sit above the header on every real sheet. */
export function titleRows(siteLabel = 'مول مصر - نظافة'): Cell[][] {
  return [
    ['شركة / بروفشنال ليدرز'],
    [`الموقع / ${siteLabel}  -  مرتبات العاملين عن شهر / أغسطس 2026`],
  ]
}
