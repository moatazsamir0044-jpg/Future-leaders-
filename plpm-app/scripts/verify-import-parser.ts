/**
 * Check the in-app workbook reader against the six workbooks whose contents are
 * already verified in the database (May, June, July 2026, both companies).
 *
 * Expected figures below are what those months actually hold, confirmed
 * column-by-column against the database earlier. If this script passes, the
 * importer sees the same payroll a human already signed off.
 *
 *   npx tsx scripts/verify-import-parser.ts <dir-with-the-six-xlsx-files>
 */
import { readFile } from 'node:fs/promises'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { readPayrollWorkbook } from '../src/lib/import/payroll-workbook'

// month -> [worker rows, net total, gross total] across BOTH company workbooks
const EXPECTED: Record<number, [number, number, number]> = {
  5: [1946, 10139739.16, 11939155.56],
  6: [2033, 10956468.72, 11247331.13],
  7: [2072, 11570851.57, 11744202.98],
}

async function main() {
  const dir = process.argv[2]
  if (!dir) throw new Error('pass the directory holding the workbooks')

  const files = readdirSync(dir).filter(f => f.endsWith('.xlsx'))
  const perMonth = new Map<number, { rows: number; net: number; gross: number; sheets: number }>()
  let problems = 0

  for (const f of files) {
    const buf = await readFile(join(dir, f))
    const wb = await readPayrollWorkbook(
      buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)

    const rows = wb.sheets.reduce((s, sh) => s + sh.rows.length, 0)
    const net = wb.sheets.reduce((s, sh) => s + sh.ourNet, 0)
    const gross = wb.sheets.reduce((s, sh) => s + sh.ourGross, 0)
    const labelled = wb.sheets.reduce(
      (s, sh) => s + sh.rows.filter(r => r.section !== null).length, 0)

    console.log(`\n${f}`)
    console.log(`   months named in titles: ${wb.monthsSeen.join(', ') || '(none)'}`)
    console.log(`   ${wb.sheets.length} sheets, ${rows} worker rows, ${labelled} with a section label`)
    for (const sh of wb.sheets) {
      const flag = sh.errors.length ? '  ERRORS' : ''
      if (sh.errors.length || sh.warnings.length) {
        console.log(`     ${sh.sheetName}: ${sh.rows.length} rows${flag}`)
        sh.errors.forEach(e => { console.log(`        error:   ${e}`); problems++ })
        sh.warnings.forEach(w => console.log(`        warning: ${w}`))
      }
    }

    // the workbooks are one month each; take the month from the majority of titles
    const month = wb.monthsSeen.length ? wb.monthsSeen[wb.monthsSeen.length - 1] : 0
    void month
    const key = guessMonth(f, wb.sheets.map(s => s.title))
    const agg = perMonth.get(key) ?? { rows: 0, net: 0, gross: 0, sheets: 0 }
    agg.rows += rows; agg.net += net; agg.gross += gross; agg.sheets += wb.sheets.length
    perMonth.set(key, agg)
  }

  console.log('\n--- totals per month, both companies combined ---')
  for (const [m, agg] of [...perMonth.entries()].sort((a, b) => a[0] - b[0])) {
    const exp = EXPECTED[m]
    if (!exp) { console.log(`month ${m}: no expected figures`); continue }
    const ok = agg.rows === exp[0]
      && Math.abs(agg.net - exp[1]) < 0.02
      && Math.abs(agg.gross - exp[2]) < 0.02
    if (!ok) problems++
    console.log(
      `month ${m}: ${agg.sheets} sheets, ${agg.rows} rows (expect ${exp[0]}), ` +
      `net ${agg.net.toFixed(2)} (expect ${exp[1].toFixed(2)}), ` +
      `gross ${agg.gross.toFixed(2)} (expect ${exp[2].toFixed(2)})  ${ok ? 'OK' : '<<< MISMATCH'}`)
  }

  console.log(problems === 0
    ? '\nPASS - the importer reads exactly the payroll already verified in the database.'
    : `\nFAIL - ${problems} problem(s).`)
  process.exit(problems === 0 ? 0 : 1)
}

/** The workbooks are one month each; the majority of sheet titles name it. */
function guessMonth(_file: string, titles: string[]): number {
  const names: Record<number, string[]> = {
    5: ['مايو'], 6: ['يونيو', 'يونيه'], 7: ['يوليو', 'يوليه'],
  }
  const tally = new Map<number, number>()
  for (const t of titles) {
    for (const [m, ns] of Object.entries(names)) {
      if (ns.some(n => t.includes(n))) tally.set(Number(m), (tally.get(Number(m)) ?? 0) + 1)
    }
  }
  let best = 0, bestCount = -1
  for (const [m, c] of tally) if (c > bestCount) { best = m; bestCount = c }
  return best
}

main().catch(e => { console.error(e); process.exit(1) })
