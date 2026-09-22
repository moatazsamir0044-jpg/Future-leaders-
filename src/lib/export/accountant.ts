import ExcelJS from 'exceljs'
import { MONTHS_AR } from '@/types'

// The monthly handoff to the external chartered accountant's office —
// replaces the Excel-over-WhatsApp flow with one structured workbook.

export interface AccountantExportData {
  month: number
  year: number
  invoices: {
    client: string; contract: string; gross: number; deductions: number
    creditNote: number; net: number; withholding: number; status: string
    issueDate: string | null; dueDate: string | null; etaRef: string | null; extraWorks: boolean
  }[]
  collections: {
    client: string; contract: string; periodLabel: string
    net: number; withholding: number; collectedDate: string; method: string
  }[]
  payroll: { site: string; gross: number; net: number; insurance: number; advances: number; status: string }[]
  expenses: { site: string; transportation: number; accommodation: number; other: number; total: number; status: string }[]
  advanceRepayments: { worker: string; site: string; amount: number; source: string }[]
  custody: { date: string; account: string; type: string; payee: string; description: string; amount: number }[]
}

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
const TOTAL_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' },
}

function addSheet(wb: ExcelJS.Workbook, name: string, title: string, headers: string[], widths: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ rightToLeft: true }] })
  const endCol = String.fromCharCode(64 + headers.length)
  ws.mergeCells(`A1:${endCol}1`)
  ws.getCell('A1').value = title
  ws.getCell('A1').font = { bold: true, size: 12 }
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  ws.getRow(1).height = 26
  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 10 }
    cell.fill = HEADER_FILL
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' }
    cell.border = THIN_BORDER
  })
  ws.columns.forEach((col, i) => { col.width = widths[i] ?? 14 })
  return ws
}

function addDataRow(ws: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = ws.addRow(values)
  row.eachCell(cell => {
    cell.border = THIN_BORDER
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  })
}

function addTotalsRow(ws: ExcelJS.Worksheet, values: (string | number)[]) {
  const row = ws.addRow(values)
  row.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = TOTAL_FILL
    cell.border = { ...THIN_BORDER, bottom: { style: 'double' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  })
}

const sum = (ns: number[]) => ns.reduce((s, n) => s + n, 0)

export async function exportAccountantPack(data: AccountantExportData): Promise<void> {
  const periodLabel = `${MONTHS_AR[data.month - 1]} ${data.year}`
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PLPM System'

  // ملخص — Summary
  const summary = wb.addWorksheet('ملخص', { views: [{ rightToLeft: true }] })
  summary.mergeCells('A1:B1')
  summary.getCell('A1').value = `شركة / بروفشنال ليدرز — بيان شهري للمحاسب القانوني — ${periodLabel}`
  summary.getCell('A1').font = { bold: true, size: 13 }
  summary.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  summary.getRow(1).height = 28
  const summaryRows: [string, number][] = [
    ['إجمالي الفواتير الصادرة (صافي)', sum(data.invoices.map(i => i.net))],
    ['إجمالي الخصم والإضافة على الفواتير', sum(data.invoices.map(i => i.withholding))],
    ['إجمالي التحصيلات خلال الشهر', sum(data.collections.map(c => c.net - c.withholding))],
    ['إجمالي المرتبات (قبل الخصومات)', sum(data.payroll.map(p => p.gross))],
    ['صافي المرتبات المنصرفة', sum(data.payroll.map(p => p.net))],
    ['إجمالي التأمينات المستقطعة', sum(data.payroll.map(p => p.insurance))],
    ['إجمالي مصروفات المواقع', sum(data.expenses.map(e => e.total))],
    ['سلف مستردة خلال الشهر', sum(data.advanceRepayments.map(a => a.amount))],
    ['مصروفات العُهد خلال الشهر', sum(data.custody.filter(c => c.type === 'مصروف').map(c => c.amount))],
  ]
  summaryRows.forEach(([label, value]) => {
    const row = summary.addRow([label, value])
    row.getCell(1).font = { bold: true }
    row.getCell(1).alignment = { horizontal: 'right', readingOrder: 'rtl' }
    row.getCell(2).numFmt = '#,##0.00'
    row.getCell(2).alignment = { horizontal: 'center' }
    row.eachCell(cell => { cell.border = THIN_BORDER })
  })
  summary.columns = [{ width: 42 }, { width: 20 }]

  // الفواتير — Invoices issued for the period
  const invWs = addSheet(wb, 'الفواتير', `فواتير ${periodLabel}`,
    ['العميل', 'العقد', 'إجمالي', 'خصومات', 'إشعار خصم', 'الصافي', 'خصم وإضافة', 'الحالة', 'تاريخ الإصدار', 'تاريخ الاستحقاق', 'رقم المنظومة', 'أعمال إضافية'],
    [24, 26, 14, 12, 12, 14, 12, 18, 14, 14, 16, 12])
  data.invoices.forEach(i => addDataRow(invWs, [
    i.client, i.contract, i.gross, i.deductions, i.creditNote, i.net, i.withholding,
    i.status, i.issueDate ?? '—', i.dueDate ?? '—', i.etaRef ?? '—', i.extraWorks ? 'نعم' : '',
  ]))
  addTotalsRow(invWs, ['الإجمالي', '',
    sum(data.invoices.map(i => i.gross)), sum(data.invoices.map(i => i.deductions)),
    sum(data.invoices.map(i => i.creditNote)), sum(data.invoices.map(i => i.net)),
    sum(data.invoices.map(i => i.withholding)), '', '', '', '', ''])

  // التحصيلات — Collections during the month
  const colWs = addSheet(wb, 'التحصيلات', `تحصيلات ${periodLabel}`,
    ['العميل', 'العقد', 'عن شهر', 'قيمة الفاتورة', 'خصم وإضافة', 'المحصل', 'تاريخ التحصيل', 'طريقة السداد'],
    [24, 26, 14, 15, 12, 15, 14, 14])
  data.collections.forEach(c => addDataRow(colWs, [
    c.client, c.contract, c.periodLabel, c.net, c.withholding, c.net - c.withholding, c.collectedDate, c.method,
  ]))
  addTotalsRow(colWs, ['الإجمالي', '', '',
    sum(data.collections.map(c => c.net)), sum(data.collections.map(c => c.withholding)),
    sum(data.collections.map(c => c.net - c.withholding)), '', ''])

  // المرتبات — Payroll per site
  const payWs = addSheet(wb, 'المرتبات', `مرتبات ${periodLabel} حسب الموقع`,
    ['الموقع', 'إجمالي المرتبات', 'صافي المرتبات', 'التأمينات', 'السلف المستقطعة', 'حالة الكشف'],
    [30, 16, 16, 14, 16, 14])
  data.payroll.forEach(p => addDataRow(payWs, [p.site, p.gross, p.net, p.insurance, p.advances, p.status]))
  addTotalsRow(payWs, ['الإجمالي',
    sum(data.payroll.map(p => p.gross)), sum(data.payroll.map(p => p.net)),
    sum(data.payroll.map(p => p.insurance)), sum(data.payroll.map(p => p.advances)), ''])

  // المصروفات — Site expenses
  const expWs = addSheet(wb, 'المصروفات', `مصروفات المواقع ${periodLabel}`,
    ['الموقع', 'نقل', 'إيجارات', 'أخرى', 'الإجمالي', 'حالة الكشف'],
    [30, 14, 14, 14, 15, 14])
  data.expenses.forEach(e => addDataRow(expWs, [e.site, e.transportation, e.accommodation, e.other, e.total, e.status]))
  addTotalsRow(expWs, ['الإجمالي',
    sum(data.expenses.map(e => e.transportation)), sum(data.expenses.map(e => e.accommodation)),
    sum(data.expenses.map(e => e.other)), sum(data.expenses.map(e => e.total)), ''])

  // السلف — Advance repayments during the month
  const advWs = addSheet(wb, 'السلف', `سلف مستردة خلال ${periodLabel}`,
    ['العامل', 'الموقع', 'المبلغ', 'المصدر'],
    [28, 26, 14, 16])
  data.advanceRepayments.forEach(a => addDataRow(advWs, [a.worker, a.site, a.amount, a.source]))
  addTotalsRow(advWs, ['الإجمالي', '', sum(data.advanceRepayments.map(a => a.amount)), ''])

  // العُهد — Custody transactions
  const cusWs = addSheet(wb, 'العُهد', `حركة العُهد خلال ${periodLabel}`,
    ['التاريخ', 'العهدة', 'النوع', 'المستفيد', 'البيان', 'المبلغ'],
    [13, 20, 10, 20, 30, 14])
  data.custody.forEach(c => addDataRow(cusWs, [c.date, c.account, c.type, c.payee, c.description, c.amount]))
  addTotalsRow(cusWs, ['الإجمالي', '', '', '', '', sum(data.custody.map(c => c.type === 'مصروف' ? -c.amount : c.amount))])

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Accountant_Pack_${data.month}_${data.year}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
