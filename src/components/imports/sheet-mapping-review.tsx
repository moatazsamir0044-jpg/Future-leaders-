'use client'

import { useTranslation } from '@/components/i18n/i18n-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ParseResponseSheet, SiteResolution } from '@/lib/import/api-types'
import type { SiteOption } from '@/lib/queries/sites-zones'

const NEW_SITE_VALUE = '__create_new__'

export function SheetMappingReview({
  sheets,
  sites,
  resolutions,
  onResolutionChange,
}: {
  sheets: ParseResponseSheet[]
  sites: SiteOption[]
  resolutions: Record<string, SiteResolution>
  onResolutionChange: (sheetName: string, resolution: SiteResolution) => void
}) {
  const { t, locale } = useTranslation()

  return (
    <div className="flex flex-col gap-3">
      {sheets.map((sheet) => {
        const resolution = resolutions[sheet.sheetName]
        const selectValue =
          !resolution ? undefined : resolution.kind === 'create_new' ? NEW_SITE_VALUE : resolution.siteId

        return (
          <Card key={sheet.sheetName}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base" dir="auto">
                {sheet.sheetName}
                {!sheet.headerFound ? <Badge variant="destructive">{t('common.error')}</Badge> : null}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {!sheet.headerFound ? (
                <p className="text-sm text-muted-foreground">{sheet.warnings.join(' ')}</p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-1.5 text-xs">
                    <Badge variant="secondary">
                      {sheet.rowCountsByKind.worker} {t('imports.rowKindWorker')}
                    </Badge>
                    {sheet.rowCountsByKind.subtotal > 0 ? (
                      <Badge variant="outline">
                        {sheet.rowCountsByKind.subtotal} {t('imports.rowKindSubtotal')}
                      </Badge>
                    ) : null}
                    {sheet.rowCountsByKind.non_worker_cost > 0 ? (
                      <Badge variant="outline">
                        {sheet.rowCountsByKind.non_worker_cost} {t('imports.rowKindNonWorkerCost')}
                      </Badge>
                    ) : null}
                    {sheet.rowCountsByKind.unknown > 0 ? (
                      <Badge variant="destructive">
                        {sheet.rowCountsByKind.unknown} {t('imports.rowKindUnknown')}
                      </Badge>
                    ) : null}
                    {!sheet.foundEndMarker ? <Badge variant="outline">{t('common.warnings')}: end marker</Badge> : null}
                  </div>

                  {sheet.unmappedHeaders.length > 0 ? (
                    <p className="text-xs text-muted-foreground">
                      {t('imports.unmappedHeaders')}: <span dir="auto">{sheet.unmappedHeaders.join(', ')}</span>
                    </p>
                  ) : null}

                  {sheet.warnings.length > 0 ? (
                    <ul className="list-inside list-disc text-xs">
                      {sheet.warnings.map((w, i) => (
                        <li key={i} className="text-muted-foreground">
                          {w}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <div className="flex flex-col gap-1.5">
                    <Label>{t('imports.proposedSite')}</Label>
                    <Select
                      value={selectValue}
                      onValueChange={(value) => {
                        if (value === NEW_SITE_VALUE) {
                          const suggested =
                            sheet.proposal?.kind === 'create_new' ? sheet.proposal.suggestedNameAr : sheet.sheetName
                          onResolutionChange(sheet.sheetName, {
                            kind: 'create_new',
                            nameAr: suggested,
                            sheetKey: sheet.sheetName,
                          })
                        } else {
                          onResolutionChange(sheet.sheetName, { kind: 'existing', siteId: value })
                        }
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-80">
                        <SelectValue placeholder={t('imports.proposedSite')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NEW_SITE_VALUE}>{t('imports.matchNew')}</SelectItem>
                        {sites.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span dir="auto">{locale === 'ar' ? s.nameAr : (s.nameEn ?? s.nameAr)}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {sheet.proposal ? (
                      <p className="text-xs text-muted-foreground">
                        {sheet.proposal.kind === 'sheet_key_match'
                          ? t('imports.matchSheetKey')
                          : sheet.proposal.kind === 'name_similarity_match'
                            ? `${t('imports.matchSimilarity')} (${Math.round(sheet.proposal.similarity * 100)}%)`
                            : t('imports.matchNew')}
                      </p>
                    ) : null}

                    {resolution?.kind === 'create_new' ? (
                      <Input
                        dir="auto"
                        value={resolution.nameAr}
                        placeholder={t('imports.newSiteName')}
                        onChange={(e) =>
                          onResolutionChange(sheet.sheetName, {
                            kind: 'create_new',
                            nameAr: e.target.value,
                            sheetKey: sheet.sheetName,
                          })
                        }
                        className="sm:w-80"
                      />
                    ) : null}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
