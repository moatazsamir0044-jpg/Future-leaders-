import { getDictionary } from '@/lib/i18n/get-dictionary'
import type { Locale } from '@/lib/i18n/config'
import { Badge } from '@/components/ui/badge'

/** Workbook-level cross-check warnings (see parse-workbook.ts) are
 * attributed to the synthetic sheet name "(workbook total)" and are the
 * financially significant ones — a real reported-vs-actual discrepancy,
 * not a routine parsing note. Styled distinctly so they don't get lost
 * among unmapped-column notices. */
function isCrossCheckWarning(warning: string): boolean {
  return warning.startsWith('(workbook total)')
}

/**
 * Surfaces every warning captured at import time (unmapped columns,
 * missing اجماليات rows, unclassified rows, and workbook-wide cross-check
 * discrepancies) after the import has been committed — not just during
 * the review screen, which disappears once you confirm. This is what a
 * real discrepancy like an advance-total gap looks like after the fact:
 * without this, that finding only existed in the moment of import review
 * (or had to be dug up by hand afterward).
 */
export function BatchWarnings({ warnings, locale }: { warnings: string[]; locale: Locale }) {
  const dict = getDictionary(locale)
  const t = (key: keyof typeof dict) => dict[key]

  if (warnings.length === 0) {
    return <p className="text-xs text-muted-foreground">✓ {t('imports.warningsClean')}</p>
  }

  const crossCheckCount = warnings.filter(isCrossCheckWarning).length

  return (
    <details className="text-xs">
      <summary className="cursor-pointer select-none text-muted-foreground marker:content-none">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true">▸</span>
          {crossCheckCount > 0 ? (
            <Badge variant="destructive">
              {crossCheckCount} {t('imports.warningsCrossCheckBadge')}
            </Badge>
          ) : null}
          {warnings.length} {t('imports.warningsSummary')}
        </span>
      </summary>
      <ul className="mt-2 flex flex-col gap-1 ps-4">
        {warnings.map((warning, i) => (
          <li
            key={i}
            dir="auto"
            className={isCrossCheckWarning(warning) ? 'font-medium text-destructive' : 'text-muted-foreground'}
          >
            {warning}
          </li>
        ))}
      </ul>
    </details>
  )
}
