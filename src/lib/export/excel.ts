import ExcelJS from 'exceljs'
import { formatMonthYear } from '@/lib/utils'
import type { PayrollRecord, PayrollPeriod, Site, ExpenseReport, ExpenseTransportation, ExpenseAccommodation, ExpenseItem } from '@/types'

export async function exportPayrollToExcel(
  period: PayrollPeriod,
  site: Site,
  records: PayrollRecord[]
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PLPM System'
  const ws = wb.addWorksheet('Payroll')

  // Header
  ws.mergeCells('A1:X1')
  ws.getCell('A1').value = `شركة / بروفشنال ليدرز`
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  ws.getCell('A1').font = { bold: true, size: 13 }

  ws.mergeCells('A2:X2')
  ws.getCell('A2').value = `الموقع / ${site.name_ar || site.name}  -  مرتبات العاملين عن شهر / ${formatMonthYear(period.month, period.year)}`
  ws.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl' }
  ws.getCell('A2').font = { bold: true, size: 11 }

  // Column headers (RTL order matching source sheets)
  const headers = [
    'رقم العامل', 'الاسم', 'عدد أيام الحضور', 'اجازات شهرى', 'اجازه سنوي', 'غياب بدون اذن',
    'ساعات اضافى', 'ساعات اقل', 'جزاءات', 'الراتب الشهرى', 'الاجر اليومى', 'صافى الايام',
    'الغياب', 'تامينات', 'فئة المواصلات', 'مواصلات', 'مكافاءت', 'سلف', 'استقطاعات',
    'الاجمالى', 'صافى الراتب', 'التوقيع'
  ]

  const headerRow = ws.addRow(headers)
  headerRow.eachCell(cell => {
    cell.font = { bold: true, size: 10 }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true, readingOrder: 'rtl' }
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' }
    }
  })

  let totalGross = 0, totalNet = 0

  records.forEach((r, i) => {
    const row = ws.addRow([
      r.worker_number ?? i + 1,
      r.employee_name,
      r.attendance_days,
      r.monthly_leave_days,
      r.annual_leave_days,
      r.absence_no_permission,
      r.overtime_hours,
      r.less_hours,
      r.penalties,
      r.base_monthly_salary,
      r.daily_wage,
      r.net_days,
      r.absence_days,
      r.insurance,
      r.transportation_category,
      r.transportation_amount,
      r.bonuses,
      r.advance,
      r.deductions,
      r.total_gross,
      r.net_salary,
      '',
    ])
    row.eachCell(cell => {
      cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
    })
    totalGross += Number(r.total_gross)
    totalNet += Number(r.net_salary)
  })

  // Totals row
  const totalsRow = ws.addRow(['', 'الاجمالى', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', totalGross.toFixed(2), totalNet.toFixed(2), ''])
  totalsRow.eachCell(cell => {
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } }
    cell.border = { top: { style: 'thin' }, bottom: { style: 'double' }, left: { style: 'thin' }, right: { style: 'thin' } }
    cell.alignment = { horizontal: 'center', vertical: 'middle' }
  })

  // Column widths
  ws.columns.forEach((col, i) => {
    col.width = i === 1 ? 30 : 12
  })
  ws.getRow(3).height = 36

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Payroll_${site.name}_${period.month}_${period.year}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}

export async function exportExpenseToExcel(
  report: ExpenseReport,
  site: Site,
  transportation: ExpenseTransportation[],
  accommodation: ExpenseAccommodation[],
  items: ExpenseItem[]
): Promise<void> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'PLPM System'
  const ws = wb.addWorksheet('Expenses')

  const titleStyle = { font: { bold: true, size: 12 }, alignment: { horizontal: 'center' as const } }

  ws.mergeCells('A1:J1')
  ws.getCell('A1').value = `مصاريف موقع: ${site.name_ar || site.name}  -  شهر ${formatMonthYear(report.month, report.year)}`
  Object.assign(ws.getCell('A1'), titleStyle)
  ws.getRow(1).height = 28

  let currentRow = 3

  // Transportation section
  if (transportation.length > 0) {
    ws.getCell(`A${currentRow}`).value = 'دورات النقل'
    ws.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FF1F3864' } }
    currentRow++
    const tHeaders = ['السياره', 'تكلفة اليوم', 'عدد الايام', 'الاجمالى']
    const hr = ws.addRow(tHeaders)
    hr.eachCell(c => { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } } })
    currentRow++
    transportation.forEach(t => {
      ws.addRow([t.vehicle_name, t.daily_cost, t.days_count, t.total])
      currentRow++
    })
    ws.addRow(['الاجمالى', '', '', report.total_transportation])
    currentRow += 2
  }

  // Accommodation section
  if (accommodation.length > 0) {
    ws.getCell(`A${currentRow}`).value = 'الايجارات'
    ws.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FF1F3864' } }
    currentRow++
    ws.addRow(['الشقة', 'الايجار'])
    currentRow++
    accommodation.forEach(a => {
      ws.addRow([a.apartment_name, a.rent_amount])
      currentRow++
    })
    ws.addRow(['الاجمالى', report.total_accommodation])
    currentRow += 2
  }

  // Other expenses
  if (items.length > 0) {
    ws.getCell(`A${currentRow}`).value = 'المصاريف'
    ws.getCell(`A${currentRow}`).font = { bold: true, color: { argb: 'FF1F3864' } }
    currentRow++
    ws.addRow(['البيان', 'المبلغ'])
    currentRow++
    items.forEach(item => {
      ws.addRow([item.description, item.amount])
      currentRow++
    })
    ws.addRow(['الاجمالى', report.total_other])
    currentRow += 2
  }

  // Grand total
  ws.getCell(`A${currentRow}`).value = 'الاجمالى الكلى'
  ws.getCell(`A${currentRow}`).font = { bold: true, size: 12 }
  ws.getCell(`B${currentRow}`).value = report.grand_total
  ws.getCell(`B${currentRow}`).font = { bold: true, size: 12 }

  ws.columns = [{ width: 40 }, { width: 16 }, { width: 14 }, { width: 16 }]

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Expenses_${site.name}_${report.month}_${report.year}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
