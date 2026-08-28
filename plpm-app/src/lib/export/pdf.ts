import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMonthYear, formatCurrency } from '@/lib/utils'
import { hasArabic } from './arabic'
import { registerArabicFont } from './pdf-font'
import type { PayrollRecord, PayrollPeriod, Site, ExpenseReport, ExpenseTransportation, ExpenseAccommodation, ExpenseItem } from '@/types'

/**
 * Applies the embedded Arabic font to any cell whose text contains Arabic.
 * Latin cells stay on Helvetica, which is narrower and lays the numeric columns
 * out better.
 */
function arabicAwareCells(arabicFont: string) {
  return (data: { cell: { text: string[]; styles: { font: string } } }) => {
    if (data.cell.text.some(line => hasArabic(line))) {
      data.cell.styles.font = arabicFont
    }
  }
}

/**
 * Builds the payroll document. Separated from the download so the produced PDF
 * can be inspected in tests without a DOM.
 */
export async function buildPayrollPdf(
  period: PayrollPeriod,
  site: Site,
  records: PayrollRecord[]
): Promise<jsPDF> {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })
  const arabicFont = await registerArabicFont(doc)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Professional Leaders - Payroll Report', doc.internal.pageSize.width / 2, 15, { align: 'center' })

  doc.setFontSize(11)
  const siteLabel = site.name_ar || site.name
  doc.setFont(hasArabic(siteLabel) ? arabicFont : 'helvetica', 'normal')
  doc.text(`Site: ${siteLabel}  |  Period: ${formatMonthYear(period.month, period.year)}  |  Status: ${period.status.toUpperCase()}`, doc.internal.pageSize.width / 2, 23, { align: 'center' })
  doc.setFont('helvetica', 'normal')

  const headers = [
    ['#', 'Employee Name', 'Attendance', 'Net Days', 'Monthly Salary', 'Daily Wage', 'Bonuses', 'Transport', 'Advance', 'Insurance', 'Deductions', 'Penalties', 'Gross Total', 'Net Salary']
  ]

  const rows = records.map((r, i) => [
    String(r.worker_number ?? i + 1),
    r.employee_name,
    String(r.attendance_days),
    String(r.net_days),
    formatCurrency(r.base_monthly_salary),
    formatCurrency(r.daily_wage),
    formatCurrency(r.bonuses),
    formatCurrency(r.transportation_amount),
    formatCurrency(r.advance),
    formatCurrency(r.insurance),
    formatCurrency(r.deductions),
    formatCurrency(r.penalties),
    formatCurrency(r.total_gross),
    formatCurrency(r.net_salary),
  ])

  const totalGross = records.reduce((s, r) => s + Number(r.total_gross), 0)
  const totalNet = records.reduce((s, r) => s + Number(r.net_salary), 0)
  rows.push(['', 'TOTAL', '', '', '', '', '', '', '', '', '', '', formatCurrency(totalGross), formatCurrency(totalNet)])

  autoTable(doc, {
    head: headers,
    body: rows,
    startY: 30,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [31, 56, 100], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 248, 255] },
    footStyles: { fillColor: [255, 242, 204], fontStyle: 'bold' },
    didParseCell: (data) => {
      arabicAwareCells(arabicFont)(data)
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [255, 242, 204]
      }
    },
  })

  return doc
}

export async function exportPayrollToPDF(
  period: PayrollPeriod,
  site: Site,
  records: PayrollRecord[]
): Promise<void> {
  const doc = await buildPayrollPdf(period, site, records)
  doc.save(`Payroll_${site.name}_${period.month}_${period.year}.pdf`)
}

/** Builds the expense document; see buildPayrollPdf for why this is split. */
export async function buildExpensePdf(
  report: ExpenseReport,
  site: Site,
  transportation: ExpenseTransportation[],
  accommodation: ExpenseAccommodation[],
  items: ExpenseItem[]
): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const arabicFont = await registerArabicFont(doc)
  const didParseCell = arabicAwareCells(arabicFont)

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Professional Leaders - Expense Report', doc.internal.pageSize.width / 2, 15, { align: 'center' })

  doc.setFontSize(11)
  const siteLabel = site.name_ar || site.name
  doc.setFont(hasArabic(siteLabel) ? arabicFont : 'helvetica', 'normal')
  doc.text(`Site: ${siteLabel}  |  Period: ${formatMonthYear(report.month, report.year)}  |  Status: ${report.status.toUpperCase()}`, doc.internal.pageSize.width / 2, 23, { align: 'center' })
  doc.setFont('helvetica', 'normal')

  let lastY = 30

  if (transportation.length > 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text('Transportation Trips', 14, lastY + 5)
    autoTable(doc, {
      head: [['Vehicle', 'Daily Cost', 'Days', 'Total']],
      body: transportation.map(t => [t.vehicle_name, formatCurrency(t.daily_cost), String(t.days_count), formatCurrency(t.total)]),
      startY: lastY + 8,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 56, 100], textColor: 255 },
      foot: [['TOTAL', '', '', formatCurrency(report.total_transportation)]],
      footStyles: { fillColor: [255, 242, 204], fontStyle: 'bold' },
      didParseCell,
    })
    lastY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  if (accommodation.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Accommodation', 14, lastY + 5)
    autoTable(doc, {
      head: [['Apartment', 'Rent Amount']],
      body: accommodation.map(a => [a.apartment_name, formatCurrency(a.rent_amount)]),
      startY: lastY + 8,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 56, 100], textColor: 255 },
      foot: [['TOTAL', formatCurrency(report.total_accommodation)]],
      footStyles: { fillColor: [255, 242, 204], fontStyle: 'bold' },
      didParseCell,
    })
    lastY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6
  }

  if (items.length > 0) {
    doc.setFont('helvetica', 'bold')
    doc.text('Other Expenses', 14, lastY + 5)
    autoTable(doc, {
      head: [['Description', 'Category', 'Amount']],
      body: items.map(i => [i.description, i.category, formatCurrency(i.amount)]),
      startY: lastY + 8,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [31, 56, 100], textColor: 255 },
      foot: [['TOTAL', '', formatCurrency(report.total_other)]],
      footStyles: { fillColor: [255, 242, 204], fontStyle: 'bold' },
      didParseCell,
    })
    lastY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`GRAND TOTAL: EGP ${formatCurrency(report.grand_total)}`, 14, lastY + 5)

  return doc
}

export async function exportExpenseToPDF(
  report: ExpenseReport,
  site: Site,
  transportation: ExpenseTransportation[],
  accommodation: ExpenseAccommodation[],
  items: ExpenseItem[]
): Promise<void> {
  const doc = await buildExpensePdf(report, site, transportation, accommodation, items)
  doc.save(`Expenses_${site.name}_${report.month}_${report.year}.pdf`)
}
