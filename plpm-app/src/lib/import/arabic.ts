// Text and number normalisation for Arabic payroll sheets.
//
// The site sheets are typed by hand, month after month, by different people.
// The same column is spelled "اجازه شهرى" one month and "أجازة شهري" the next,
// numbers arrive as Arabic-Indic digits, and stray RTL marks ride along on
// copy-paste. Everything here exists so that cosmetic variation never changes
// which column a value lands in, or what that value is.

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩' // ٠..٩
const EXTENDED_ARABIC_INDIC = '۰۱۲۳۴۵۶۷۸۹' // ۰..۹

// Bidi controls, zero-width joiners and the tatweel stretch character. These
// are invisible, so a header carrying one looks identical to one that doesn't.
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2066-\u2069\u0640\uFEFF]/g

// Arabic combining marks (fatha, damma, shadda, sukun …).
const DIACRITICS = /[\u064B-\u065F\u0670]/g

/** Convert Arabic-Indic and Extended Arabic-Indic digits to ASCII 0-9. */
export function toAsciiDigits(input: string): string {
  let out = ''
  for (const ch of input) {
    const ai = ARABIC_INDIC.indexOf(ch)
    if (ai !== -1) { out += String(ai); continue }
    const ei = EXTENDED_ARABIC_INDIC.indexOf(ch)
    if (ei !== -1) { out += String(ei); continue }
    out += ch
  }
  return out
}

/**
 * Fold a header or label to a comparison key.
 *
 * Unifies the letter forms that Egyptian data entry treats as interchangeable
 * (أ إ آ ٱ → ا, ة → ه, ى → ي, ؤ → و, ئ → ي), drops diacritics, invisibles and
 * punctuation, then collapses whitespace. "أجازة سنوية" and "اجازه سنويه"
 * both fold to "اجازه سنويه".
 */
export function normalizeKey(input: unknown): string {
  if (input == null) return ''
  return toAsciiDigits(String(input))
    .replace(INVISIBLE, '')
    .replace(DIACRITICS, '')
    .replace(/[\u0623\u0625\u0622\u0671]/g, '\u0627') // أ إ آ ٱ -> ا
    .replace(/ة/g, 'ه')                     // ة → ه
    .replace(/ى/g, 'ي')                     // ى → ي
    .replace(/ؤ/g, 'و')                     // ؤ → و
    .replace(/ئ/g, 'ي')                     // ئ → ي
    .replace(/[.،,;:/\\()[\]{}"'`*#&+_-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Trim a cell's display text without altering the characters we keep. */
export function cleanText(input: unknown): string {
  if (input == null) return ''
  return String(input).replace(INVISIBLE, '').replace(/\s+/g, ' ').trim()
}

export interface NumberParse {
  ok: boolean
  value: number
  /** Set when ok is false — the raw text that could not be read as a number. */
  raw?: string
}

const EMPTY_MARKERS = new Set(['', '-', '--', '—', '–', '/', 'n/a', 'na', 'لا', 'لايوجد', 'لا يوجد'])

/**
 * Read a spreadsheet cell as a number.
 *
 * Blank cells and the dashes people use for "nothing here" read as 0. Anything
 * else that isn't a number fails loudly rather than silently becoming 0 — a
 * salary column quietly zeroed is exactly the kind of error that survives
 * review and reaches a payslip.
 */
export function parseNumber(input: unknown): NumberParse {
  if (input == null) return { ok: true, value: 0 }
  if (typeof input === 'number') {
    return Number.isFinite(input) ? { ok: true, value: input } : { ok: false, value: 0, raw: String(input) }
  }
  if (typeof input === 'boolean') return { ok: false, value: 0, raw: String(input) }
  if (input instanceof Date) return { ok: false, value: 0, raw: input.toISOString() }

  const raw = String(input)
  let s = toAsciiDigits(raw).replace(INVISIBLE, '').trim()
  if (EMPTY_MARKERS.has(s.toLowerCase())) return { ok: true, value: 0 }

  // Accounting negatives: (1,234.50)
  let negative = false
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1).trim() }

  s = s
    .replace(/\u066B/g, '.')                    // Arabic decimal separator
    .replace(/[\u066C\u2009\u00A0]/g, '')      // thousands sep, thin/nbsp space
    .replace(/[٪%]/g, '')
    .replace(/(?:egp|le|جنيه|ج\.م)/gi, '')
    .replace(/\s/g, '')

  // Thousands separators, but only in the grouping positions a spreadsheet
  // would produce (1,234 / 1,234,567.89). A lone "1,5" is a decimal comma.
  if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) s = s.replace(/,/g, '')
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.')

  if (s === '' || s === '-') return { ok: true, value: 0 }
  if (!/^-?\d*\.?\d+$/.test(s)) return { ok: false, value: 0, raw }

  const n = Number(s)
  if (!Number.isFinite(n)) return { ok: false, value: 0, raw }
  return { ok: true, value: negative ? -n : n }
}

/** Round to 2dp the way money is rounded, avoiding float drift on .005 cases. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}
