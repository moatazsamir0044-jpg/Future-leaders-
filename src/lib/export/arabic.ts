// Detecting Arabic text so the PDF exports can switch fonts for it.
//
// jsPDF already shapes Arabic (mapping letters to their contextual forms) and
// reorders right-to-left runs when it writes a text run. What it cannot do is
// invent glyphs: its built-in fonts are WinAnsi-encoded and carry none for
// Arabic, which is why every Arabic name came out of the payroll PDF as
// mojibake. The fix is only to hand those runs a font that has the glyphs --
// see pdf-font.ts. Do NOT pre-shape or pre-reverse the text before passing it
// to jsPDF: that double-applies the reordering and lays the name out backwards.

const ARABIC_RANGES: [number, number][] = [
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Presentation Forms-A
  [0xfe70, 0xfeff], // Presentation Forms-B
]

/** True when the string contains at least one Arabic character. */
export function hasArabic(text: string | null | undefined): boolean {
  if (!text) return false
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (ARABIC_RANGES.some(([lo, hi]) => code >= lo && code <= hi)) return true
  }
  return false
}
