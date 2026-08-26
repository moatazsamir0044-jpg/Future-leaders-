/**
 * Emit the exact payload the importer would send for one worksheet, so the
 * database side can be exercised with real data rather than a hand-made sample.
 *
 *   npx tsx scripts/dump-import-payload.ts <file.xlsx> "<sheet name>"
 */
import { readFile } from 'node:fs/promises'
import { readPayrollWorkbook, NUMERIC_FIELDS, round2 } from '../src/lib/import/payroll-workbook'

async function main() {
  const [file, sheetName] = process.argv.slice(2)
  const buf = await readFile(file)
  const wb = await readPayrollWorkbook(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
  const sheet = wb.sheets.find(s => s.sheetName === sheetName)
  if (!sheet) throw new Error(`no sheet ${sheetName}; have: ${wb.sheets.map(s => s.sheetName).join(', ')}`)

  const rows = sheet.rows.map(r => {
    const out: Record<string, string | number | null> = {
      worker_number: r.workerNumber,
      employee_name: r.employeeName,
      notes: r.section,
    }
    for (const f of NUMERIC_FIELDS) out[f] = r.values[f]
    return out
  })

  console.error(`${sheet.rows.length} rows, net ${sheet.ourNet}, gross ${sheet.ourGross}, ` +
    `printed net ${sheet.printedNet}, printed gross ${sheet.printedGross}`)
  console.log(JSON.stringify({
    total_gross: round2(sheet.printedGross ?? sheet.ourGross),
    total_net: round2(sheet.printedNet ?? sheet.ourNet),
    rows,
  }))
}
main().catch(e => { console.error(e); process.exit(1) })
