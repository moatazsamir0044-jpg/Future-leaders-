import ExcelJS from 'exceljs'
import { cleanText, normalizeKey, parseNumber, round2 } from './arabic'
import {
  detectColumns, looksLikeHeader, isTotalLabel,
  NUMERIC_FIELDS, REQUIRED_FIELDS, MISSING_FIELD_LABELS,
  type ColumnMap, type NumericField, type SheetField,
} from './columns'

/**
 * Sheet totals are allowed to differ from the rows by a single piastre — that
 * is display rounding in the sheet's own SUM, not a data problem. Anything
 * larger is treated as a real disagreement and blocks the import; a non-zero
 * difference within tolerance is still reported, never hidden.
 */
const TOLERANCE = 0.01

/**
 * Headings that belong to the sheet's title block rather than to a section.
 * Every real sheet opens with the company line and a "site / month" line
 * directly above the first header, and neither describes a group of workers.
 */
const TITLE_MARKERS = [
  'شركة', 'شركه', 'بروفشنال', 'مرتبات العاملين', 'كشف مرتبات', 'كشف',
  'الموقع', 'عن شهر', 'payroll', 'company', 'site',
].map(normalizeKey)

function isTitleLike(text: string): boolean {
  const key = normalizeKey(text)
  if (!key) return true
  return TITLE_MARKERS.some(m => key === m || key.includes(m))
}

export type IssueSeverity = 'error' | 'warning'

export interface SheetIssue {
  severity: IssueSeverity
  code: string
  message: string
  rowNumber?: number
}

export type ParsedRow = {
  /** 1-based row number in the worksheet, so review can point at the source. */
  rowNumber: number
  /** Section heading this row sits under (route, building, shift) → notes. */
  section: string | null
  worker_number: number | null
  employee_name: string
} & Record<NumericField, number>

export interface TotalsRow {
  rowNumber: number
  label: string
  gross: number | null
  net: number | null
  /** What the figure reconciled against, once checked. */
  reconciled: 'section' | 'sheet' | null
}

export interface ParsedSheet {
  sheetName: string
  headerRowNumber: number | null
  columns: ColumnMap | null
  rows: ParsedRow[]
  totalsRows: TotalsRow[]
  sumGross: number
  sumNet: number
  issues: SheetIssue[]
  /** True when this sheet must not be imported until the file is corrected. */
  blocked: boolean
  /** Sheets with no payroll shape at all (cover pages, summaries). */
  skipped: boolean
}

export interface ParsedWorkbook {
  fileName: string
  sheets: ParsedSheet[]
}

/**
 * Unwrap an ExcelJS cell into the primitive the sheet displays.
 *
 * Formula cells are the important case: we take the cached result Excel stored
 * with the file. A formula whose result was never cached returns the marker
 * object below rather than a guess, because the alternative — re-evaluating
 * the site's formula ourselves — is precisely the assumption this importer
 * refuses to make.
 */
const UNCACHED = Symbol('uncached-formula')
const CELL_ERROR = Symbol('cell-error')

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'object') {
    if (value instanceof Date) return value
    if ('error' in value) return CELL_ERROR
    if ('richText' in value) {
      return (value.richText as { text: string }[]).map(t => t.text).join('')
    }
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as { result?: ExcelJS.CellValue }).result
      if (result === undefined || result === null) return UNCACHED
      if (typeof result === 'object' && 'error' in (result as object)) return CELL_ERROR
      return cellValue(result)
    }
    if ('hyperlink' in value && 'text' in value) return (value as { text: string }).text
    if ('result' in value) return cellValue((value as { result: ExcelJS.CellValue }).result)
  }
  return value
}

function rowCells(row: ExcelJS.Row, width: number): unknown[] {
  const out: unknown[] = []
  for (let c = 1; c <= width; c++) out.push(cellValue(row.getCell(c).value))
  return out
}

const asText = (v: unknown): string => {
  if (v === UNCACHED || v === CELL_ERROR) return ''
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return v.toISOString()
  return cleanText(v)
}

const emptyNumerics = (): Record<NumericField, number> =>
  Object.fromEntries(NUMERIC_FIELDS.map(f => [f, 0])) as Record<NumericField, number>

/** Parse a whole workbook. Pure: no DOM, no network, no database. */
export async function parsePayrollWorkbook(
  data: ArrayBuffer | Buffer,
  fileName = 'workbook.xlsx',
): Promise<ParsedWorkbook> {
  const wb = new ExcelJS.Workbook()
  // ExcelJS declares its own Buffer shape for the reader, but accepts any
  // ArrayBuffer-backed input at runtime — which is what a browser File gives us.
  await wb.xlsx.load(data as unknown as Parameters<typeof wb.xlsx.load>[0])

  const sheets: ParsedSheet[] = []
  wb.eachSheet(ws => { sheets.push(parseSheet(ws)) })
  return { fileName, sheets }
}

function parseSheet(ws: ExcelJS.Worksheet): ParsedSheet {
  const issues: SheetIssue[] = []
  const rows: ParsedRow[] = []
  const totalsRows: TotalsRow[] = []

  let columns: ColumnMap | null = null
  let headerRowNumber: number | null = null
  let section: string | null = null
  /**
   * The lone text row immediately above the current position. When a header
   * follows it, that text was labelling the block the header introduces —
   * this is how the first section of a sheet gets its name, since it sits
   * above the first header rather than between two of them.
   */
  let pendingLabel: string | null = null
  /** Index into `rows` where the current un-subtotalled block starts. */
  let blockStart = 0

  const width = Math.max(ws.columnCount, 1)
  const lastRow = ws.rowCount

  for (let r = 1; r <= lastRow; r++) {
    const row = ws.getRow(r)
    const values = rowCells(row, width)
    const texts = values.map(asText)

    if (texts.every(t => t === '')) continue

    // Is this row a single piece of text standing on its own?
    const nonEmpty = texts.filter(t => t !== '')
    const soleTextIdx = nonEmpty.length === 1 ? texts.findIndex(t => t !== '') : -1
    const soleText = soleTextIdx !== -1 && typeof values[soleTextIdx] !== 'number'
      && !/^-?[\d.,]+$/.test(nonEmpty[0])
      ? nonEmpty[0]
      : null

    // A header row can appear more than once — each section repeats it, and
    // the column order is not guaranteed to be identical between sections.
    const candidate = detectColumns(texts)
    if (looksLikeHeader(candidate)) {
      columns = candidate
      if (headerRowNumber === null) headerRowNumber = r
      if (pendingLabel !== null && !isTitleLike(pendingLabel)) section = pendingLabel
      pendingLabel = null
      continue
    }

    if (!columns) { pendingLabel = soleText; continue } // title/preamble rows

    pendingLabel = soleText

    const nameIdx = columns.byField.employee_name!
    const nameText = texts[nameIdx] ?? ''
    const totalLabelIdx = texts.findIndex(t => t !== '' && isTotalLabel(t))
    // Worker number counts as a figure here. A roster row whose money columns
    // are all blank is still a worker, and must never be mistaken for a
    // section heading and dropped — it has to reach review as a zero row.
    const figureIndexes = ([...NUMERIC_FIELDS, 'worker_number'] as SheetField[])
      .map(f => columns!.byField[f])
      .filter((i): i is number => i !== undefined)
    const hasNumbers = figureIndexes.some(i => {
      const v = values[i]
      if (v === UNCACHED || v === CELL_ERROR) return true
      if (typeof v === 'number') return true
      return typeof v === 'string' && parseNumber(v).ok && v.trim() !== ''
    })

    // ---- totals / subtotal row -------------------------------------------
    if (totalLabelIdx !== -1 && (nameText === '' || isTotalLabel(nameText))) {
      const gross = readOptionalNumber(values, columns.byField.total_gross, r, issues, 'total_gross')
      const net = readOptionalNumber(values, columns.byField.net_salary, r, issues, 'net_salary')
      const entry: TotalsRow = { rowNumber: r, label: texts[totalLabelIdx], gross, net, reconciled: null }

      reconcile(entry, rows, blockStart, issues)
      totalsRows.push(entry)
      blockStart = rows.length
      continue
    }

    // ---- section heading --------------------------------------------------
    // A lone piece of text with no figures beside it labels the block that
    // follows (a transport route, a building, a shift). It becomes the row's
    // `notes`, matching how the existing production rows carry these labels.
    if (!hasNumbers) {
      const label = nameText || texts.find(t => t !== '') || ''
      if (label !== '') section = label
      continue
    }

    // ---- data row ----------------------------------------------------------
    if (nameText === '') {
      issues.push({
        severity: 'error', code: 'row_without_name', rowNumber: r,
        message: `Row ${r} has figures but no employee name.`,
      })
      continue
    }

    const parsed: ParsedRow = {
      rowNumber: r,
      section,
      worker_number: null,
      employee_name: nameText,
      ...emptyNumerics(),
    }

    const wnIdx = columns.byField.worker_number
    if (wnIdx !== undefined) {
      const raw = values[wnIdx]
      if (raw !== null && raw !== undefined && asText(raw) !== '') {
        const n = parseNumber(raw)
        // A non-numeric worker number is a label, not a failure: the sheets use
        // this column for things like "مؤقت". The number is optional anyway.
        if (n.ok && Number.isFinite(n.value)) parsed.worker_number = Math.trunc(n.value)
      }
    }

    let rowFailed = false
    for (const field of NUMERIC_FIELDS) {
      const idx = columns.byField[field]
      if (idx === undefined) continue
      const raw = values[idx]
      if (raw === UNCACHED) {
        issues.push({
          severity: 'error', code: 'uncached_formula', rowNumber: r,
          message: `Row ${r}, column "${MISSING_FIELD_LABELS[field]}" holds a formula with no saved result. Open the file in Excel, let it calculate, save, and re-upload.`,
        })
        rowFailed = true
        continue
      }
      if (raw === CELL_ERROR) {
        issues.push({
          severity: 'error', code: 'cell_error', rowNumber: r,
          message: `Row ${r}, column "${MISSING_FIELD_LABELS[field]}" contains an Excel error value (#REF!, #DIV/0! …).`,
        })
        rowFailed = true
        continue
      }
      const n = parseNumber(raw)
      if (!n.ok) {
        issues.push({
          severity: 'error', code: 'unreadable_number', rowNumber: r,
          message: `Row ${r}, column "${MISSING_FIELD_LABELS[field]}" contains "${n.raw}", which is not a number.`,
        })
        rowFailed = true
        continue
      }
      parsed[field] = round2(n.value)
    }

    if (rowFailed) continue
    rows.push(parsed)
  }

  const sumGross = round2(rows.reduce((s, r) => s + r.total_gross, 0))
  const sumNet = round2(rows.reduce((s, r) => s + r.net_salary, 0))

  const sheet: ParsedSheet = {
    sheetName: ws.name,
    headerRowNumber,
    columns,
    rows,
    totalsRows,
    sumGross,
    sumNet,
    issues,
    blocked: false,
    skipped: false,
  }

  finalise(sheet)
  return sheet
}

function readOptionalNumber(
  values: unknown[],
  idx: number | undefined,
  rowNumber: number,
  issues: SheetIssue[],
  field: SheetField,
): number | null {
  if (idx === undefined) return null
  const raw = values[idx]
  if (raw === UNCACHED || raw === CELL_ERROR) {
    issues.push({
      severity: 'error', code: 'totals_unreadable', rowNumber,
      message: `The totals row ${rowNumber} has an unusable ${field} cell (uncalculated formula or Excel error), so the sheet cannot be cross-checked.`,
    })
    return null
  }
  const n = parseNumber(raw)
  return n.ok ? round2(n.value) : null
}

/**
 * Check a totals row against the rows above it.
 *
 * A sheet may subtotal each section, total the whole sheet at the end, or
 * both — and the last total often repeats the section subtotal when there is
 * only one section. Accepting a match against either the current block or the
 * whole sheet covers all three without needing to know which layout is in use.
 */
function reconcile(entry: TotalsRow, rows: ParsedRow[], blockStart: number, issues: SheetIssue[]): void {
  if (entry.gross === null && entry.net === null) return

  const block = rows.slice(blockStart)
  const blockGross = round2(block.reduce((s, r) => s + r.total_gross, 0))
  const blockNet = round2(block.reduce((s, r) => s + r.net_salary, 0))
  const allGross = round2(rows.reduce((s, r) => s + r.total_gross, 0))
  const allNet = round2(rows.reduce((s, r) => s + r.net_salary, 0))

  const matches = (expected: number | null, actual: number) =>
    expected === null || Math.abs(expected - actual) <= TOLERANCE

  const noteRounding = (expGross: number, expNet: number) => {
    const dg = entry.gross === null ? 0 : round2(entry.gross - expGross)
    const dn = entry.net === null ? 0 : round2(entry.net - expNet)
    if (dg === 0 && dn === 0) return
    issues.push({
      severity: 'warning', code: 'totals_rounding', rowNumber: entry.rowNumber,
      message: `The total on row ${entry.rowNumber} is off by ${dg !== 0 ? `${dg.toFixed(2)} gross` : ''}${dg !== 0 && dn !== 0 ? ' and ' : ''}${dn !== 0 ? `${dn.toFixed(2)} net` : ''} — within rounding, imported as listed.`,
    })
  }

  if (matches(entry.gross, blockGross) && matches(entry.net, blockNet)) {
    entry.reconciled = 'section'
    noteRounding(blockGross, blockNet)
    return
  }
  if (matches(entry.gross, allGross) && matches(entry.net, allNet)) {
    entry.reconciled = 'sheet'
    noteRounding(allGross, allNet)
    return
  }

  const parts: string[] = []
  if (entry.gross !== null) {
    parts.push(`gross ${entry.gross.toFixed(2)} vs ${blockGross.toFixed(2)} counted (${round2(entry.gross - blockGross).toFixed(2)} out)`)
  }
  if (entry.net !== null) {
    parts.push(`net ${entry.net.toFixed(2)} vs ${blockNet.toFixed(2)} counted (${round2(entry.net - blockNet).toFixed(2)} out)`)
  }
  issues.push({
    severity: 'error', code: 'totals_mismatch', rowNumber: entry.rowNumber,
    message: `The sheet's own total on row ${entry.rowNumber} disagrees with the rows above it — ${parts.join('; ')}. Rows may be hidden, filtered, or outside the totalled range.`,
  })
}

/** Apply the sheet-level checks and decide whether the sheet can be imported. */
function finalise(sheet: ParsedSheet): void {
  const { columns, rows, issues } = sheet

  if (!columns || sheet.headerRowNumber === null) {
    sheet.skipped = true
    issues.push({
      severity: 'warning', code: 'no_header',
      message: 'No payroll header row found on this sheet — nothing to import.',
    })
    sheet.blocked = false
    return
  }

  const missing = REQUIRED_FIELDS.filter(f => columns.byField[f] === undefined)
  if (missing.length > 0) {
    issues.push({
      severity: 'error', code: 'missing_columns',
      message: `Required column${missing.length > 1 ? 's' : ''} not found: ${missing.map(f => MISSING_FIELD_LABELS[f]).join(', ')}.`,
    })
  }

  if (rows.length === 0 && missing.length === 0) {
    sheet.skipped = true
    issues.push({
      severity: 'warning', code: 'no_rows',
      message: 'The header was found but no employee rows follow it.',
    })
  }

  if (columns.unmatched.length > 0) {
    issues.push({
      severity: 'warning', code: 'unmatched_columns',
      message: `Column${columns.unmatched.length > 1 ? 's' : ''} not recognised and therefore not imported: ${columns.unmatched.map(u => `"${u.text}"`).join(', ')}.`,
    })
  }

  const optionalMissing = ([...NUMERIC_FIELDS, 'worker_number'] as SheetField[])
    .filter(f => columns.byField[f] === undefined)
  if (optionalMissing.length > 0) {
    issues.push({
      severity: 'warning', code: 'columns_defaulted',
      message: `Not present on this sheet, so stored as 0: ${optionalMissing.map(f => MISSING_FIELD_LABELS[f]).join(', ')}.`,
    })
  }

  if (rows.length > 0 && sheet.totalsRows.length === 0) {
    issues.push({
      severity: 'warning', code: 'no_totals_row',
      message: `This sheet has no totals row, so the ${rows.length} rows could not be cross-checked against a figure the sheet computed itself. Confirm the totals below against the original.`,
    })
  }

  // Advisory arithmetic checks. These never change a value and never block:
  // production data shows the sites' sheets legitimately differ in how they
  // reach a figure, so a mismatch is something for a human to look at, not
  // something for this importer to "correct".
  const netOff = rows.filter(r => {
    const derived = round2(r.total_gross - r.advance - r.insurance - r.deductions - r.penalties)
    return Math.abs(derived - r.net_salary) > TOLERANCE
  })
  if (netOff.length > 0) {
    issues.push({
      severity: 'warning', code: 'net_not_gross_minus_deductions',
      message: `${netOff.length} row${netOff.length > 1 ? 's' : ''} where net ≠ gross − advance − insurance − deductions − penalties (rows ${netOff.slice(0, 5).map(r => r.rowNumber).join(', ')}${netOff.length > 5 ? ', …' : ''}). Imported exactly as the sheet has them.`,
    })
  }

  const negatives = rows.filter(r => r.net_salary < 0)
  if (negatives.length > 0) {
    issues.push({
      severity: 'warning', code: 'negative_net',
      message: `${negatives.length} row${negatives.length > 1 ? 's' : ''} with a negative net salary (rows ${negatives.slice(0, 5).map(r => r.rowNumber).join(', ')}${negatives.length > 5 ? ', …' : ''}).`,
    })
  }

  const blank = rows.filter(r => r.total_gross === 0 && r.net_salary === 0)
  if (blank.length > 0) {
    issues.push({
      severity: 'warning', code: 'zero_rows',
      message: `${blank.length} row${blank.length > 1 ? 's' : ''} with zero gross and zero net (rows ${blank.slice(0, 5).map(r => r.rowNumber).join(', ')}${blank.length > 5 ? ', …' : ''}).`,
    })
  }

  const seen = new Map<string, number>()
  const dupes: number[] = []
  for (const r of rows) {
    const key = `${r.section ?? ''}|${r.worker_number ?? ''}|${r.employee_name}`
    if (seen.has(key)) dupes.push(r.rowNumber)
    else seen.set(key, r.rowNumber)
  }
  if (dupes.length > 0) {
    issues.push({
      severity: 'warning', code: 'duplicate_rows',
      message: `${dupes.length} row${dupes.length > 1 ? 's' : ''} repeat a name and worker number already listed in the same section (rows ${dupes.slice(0, 5).join(', ')}${dupes.length > 5 ? ', …' : ''}). Check the sheet does not list someone twice.`,
    })
  }

  sheet.blocked = issues.some(i => i.severity === 'error')
}

/**
 * The payload the `import_payroll_sheet` database function reads, in sheet
 * order. Field names match its record definition exactly; every numeric column
 * is sent explicitly so no value ever depends on a database default.
 */
export interface ImportRow extends Record<NumericField, number> {
  worker_number: number | null
  employee_name: string
  notes: string | null
}

export function toImportRows(sheet: ParsedSheet): ImportRow[] {
  return sheet.rows.map(r => ({
    worker_number: r.worker_number,
    employee_name: r.employee_name,
    notes: r.section,
    ...(Object.fromEntries(NUMERIC_FIELDS.map(f => [f, r[f]])) as Record<NumericField, number>),
  }))
}
