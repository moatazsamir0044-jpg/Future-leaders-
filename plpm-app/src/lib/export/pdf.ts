import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatMonthYear, formatCurrency } from '@/lib/utils'
import type { PayrollRecord, PayrollPeriod, Site, ExpenseReport, ExpenseTransportation, ExpenseAccommodation, ExpenseItem } from '@/types'

export function exportPayrollToPDF(
  period: PayrollPeriod,
  site: Site,
  records: PayrollRecord[]
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Professional Leaders - Payroll Report', doc.internal.pageSize.width / 2, 15, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Site: ${site.name}  |  Period: ${formatMonthYear(period.month, period.year)}  |  Status: ${period.status.toUpperCase()}`, doc.internal.pageSize.width / 2, 23, { align: 'center' })

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
      if (data.row.index === rows.length - 1) {
        data.cell.styles.fontStyle = 'bold'
        data.cell.styles.fillColor = [255, 242, 204]
      }
    },
  })

  doc.save(`Payroll_${site.name}_${period.month}_${period.year}.pdf`)
}

export function exportExpenseToPDF(
  report: ExpenseReport,
  site: Site,
  transportation: ExpenseTransportation[],
  accommodation: ExpenseAccommodation[],
  items: ExpenseItem[]
): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })

  doc.setFontSize(14)
  doc.setFont('helvetica', 'bold')
  doc.text('Professional Leaders - Expense Report', doc.internal.pageSize.width / 2, 15, { align: 'center' })

  doc.setFontSize(11)
  doc.setFont('helvetica', 'normal')
  doc.text(`Site: ${site.name}  |  Period: ${formatMonthYear(report.month, report.year)}  |  Status: ${report.status.toUpperCase()}`, doc.internal.pageSize.width / 2, 23, { align: 'center' })

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
    })
    lastY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  doc.setFontSize(12)
  doc.setFont('helvetica', 'bold')
  doc.text(`GRAND TOTAL: EGP ${formatCurrency(report.grand_total)}`, 14, lastY + 5)

  doc.save(`Expenses_${site.name}_${report.month}_${report.year}.pdf`)
}
