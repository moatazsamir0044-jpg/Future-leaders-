// Arabic text normalization used for two things in this parser: matching a
// source column header against HEADER_ALIASES, and matching a sheet's tab
// name against a known site's sheet_key/name. Neither comparison should
// care about alef-variant spelling, decorative tatweel characters, or
// incidental whitespace differences — all confirmed sources of the "drifted
// column-label spelling" messiness described in the import plan.

const TATWEEL = /ـ/g

// أ إ آ ٱ -> ا
const ALEF_VARIANTS = /[آأإٱ]/g

const WHITESPACE = /\s+/g

/**
 * Normalizes Arabic (and mixed Arabic/Latin) text for comparison purposes:
 * unifies alef variants, strips tatweel, collapses whitespace, and trims.
 * Not intended for display — only for equality/substring checks.
 */
export function normalizeArabic(text: string | null | undefined): string {
  if (text == null) return ''
  return String(text)
    .replace(TATWEEL, '')
    .replace(ALEF_VARIANTS, 'ا')
    .replace(WHITESPACE, ' ')
    .trim()
}

/** normalizeArabic() plus a stable comparison key: also case-folds (for any
 * Latin characters mixed into a header, e.g. "H Office"). */
export function normalizeForCompare(text: string | null | undefined): string {
  return normalizeArabic(text).toLowerCase()
}
