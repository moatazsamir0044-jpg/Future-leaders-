import type jsPDF from 'jspdf'

export const ARABIC_FONT = 'NotoNaskhArabic'

/**
 * Registers the embedded Arabic font on a jsPDF document and returns its name.
 *
 * The font is ~100 KB, so it is imported dynamically: only someone who actually
 * exports a PDF pays for it, and it stays out of every page bundle. Each new
 * document needs its own registration, so this is called per export.
 */
export async function registerArabicFont(doc: jsPDF): Promise<string> {
  const { NOTO_NASKH_ARABIC_TTF_BASE64 } = await import('./fonts/noto-naskh-arabic')
  doc.addFileToVFS('NotoNaskhArabic-Regular.ttf', NOTO_NASKH_ARABIC_TTF_BASE64)
  doc.addFont('NotoNaskhArabic-Regular.ttf', ARABIC_FONT, 'normal')
  return ARABIC_FONT
}
