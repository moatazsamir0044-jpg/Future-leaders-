// Tolerant cell-value coercion. The source sheets are hand-maintained
// accounting spreadsheets: numbers show up as actual numbers, as text with
// Arabic-Indic digits or thousands separators, as formula results, as a
// lone dash meaning "zero/blank", or genuinely empty. None of that should
// throw or silently become 0 when it really means "no data" — it becomes
// `null` instead, so a missing figure stays visibly missing all the way
// through to `pv_payroll_lines`.

// ExcelJS's CellValue type covers primitives plus a handful of rich shapes
// (formula results, rich text runs, hyperlinks). Typed loosely here so this
// module has no hard dependency on exceljs's type export shape.
export type CellLike =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | { result?: unknown; formula?: unknown }
  | { richText?: Array<{ text?: unknown }> }
  | { text?: unknown; hyperlink?: unknown }

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩'

function arabicIndicToLatinDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const idx = ARABIC_INDIC_DIGITS.indexOf(ch)
    out += idx === -1 ? ch : String(idx)
  }
  return out
}

/** Coerces any cell value to a plain display string, trimmed. Never throws.
 *
 * Handles exceljs's full CellValue union, not just the shapes a normal
 * worker row hits: a formula/shared-formula cell (`{formula, result?}` /
 * `{sharedFormula, formula, result?}`) whose `result` is genuinely absent —
 * confirmed present in the real files, on freeform subtotal-row cells that
 * don't align to the worker-row grid — used to fall through every check
 * here to the final `String(value)`, which for a plain object is the
 * literal text "[object Object]", silently corrupting raw_row. */
export function coerceText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()

  if (typeof value === 'object') {
    const obj = value as {
      result?: unknown
      richText?: Array<{ text?: unknown }>
      text?: unknown
      error?: unknown
      formula?: unknown
      sharedFormula?: unknown
    }
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((run) => (run && typeof run.text === 'string' ? run.text : '')).join('').trim()
    }
    if (typeof obj.error === 'string') return obj.error
    if ('result' in obj) return coerceText(obj.result)
    if (typeof obj.text === 'string') return obj.text.trim()
    // A formula/shared-formula cell with no `result` at all — exceljs
    // never computed or cached one. There is no value to show; that's
    // "genuinely blank", not "unparseable", so this is not a fallthrough
    // to String(value).
    if (typeof obj.formula === 'string' || typeof obj.sharedFormula === 'string') return ''
  }

  return String(value).trim()
}

const BLANK_NUMERIC_TOKENS = new Set(['', '-', '—', '–', 'ـ', 'N/A', 'n/a'])

/**
 * Coerces any cell value to a number, or null when it clearly represents
 * "no value" (empty, a lone dash, non-numeric text). Handles Arabic-Indic
 * digits and thousands separators. Never throws.
 */
export function coerceNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return null

  if (typeof value === 'object') {
    const obj = value as {
      result?: unknown
      richText?: unknown
      error?: unknown
      formula?: unknown
      sharedFormula?: unknown
    }
    if (typeof obj.error === 'string') return null
    if ('result' in obj) return coerceNumber(obj.result)
    if (Array.isArray((obj as { richText?: unknown }).richText)) {
      return coerceNumber(coerceText(value))
    }
    // See coerceText: a formula cell with no cached result is genuinely
    // blank, not unparseable text that happens to fail Number() below.
    if (typeof obj.formula === 'string' || typeof obj.sharedFormula === 'string') return null
  }

  let text = coerceText(value)
  if (BLANK_NUMERIC_TOKENS.has(text)) return null

  text = arabicIndicToLatinDigits(text)
    .replace(/[,\s٬]/g, '') // thousands separators (Latin comma + Arabic thousands mark) and stray whitespace
    .replace(/[٪%]/g, '') // trailing percent sign, if any slipped in
  if (text === '') return null

  const parsed = Number(text)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * Coerces a cell value to something safe to store directly in a jsonb
 * column (raw_row): numbers stay numbers, blank/whitespace-only text
 * becomes null, everything else becomes a trimmed string. Used to build
 * raw_row, which preserves every original cell — mapped or not — keyed by
 * its literal header text.
 */
export function toRawJsonValue(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value
  const text = coerceText(value)
  return text === '' ? null : text
}
