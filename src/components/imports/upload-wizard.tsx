'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SheetMappingReview } from './sheet-mapping-review'
import type { ParseResponseBody, SiteResolution } from '@/lib/import/api-types'
import type { ZoneOption, SiteOption } from '@/lib/queries/sites-zones'

const CURRENT_YEAR = new Date().getFullYear()
const YEARS = [CURRENT_YEAR + 1, CURRENT_YEAR, CURRENT_YEAR - 1, CURRENT_YEAR - 2]
const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1)

export function UploadWizard({ zones, sites }: { zones: ZoneOption[]; sites: SiteOption[] }) {
  const { t, locale } = useTranslation()
  const router = useRouter()

  const [scope, setScope] = useState<'zone' | 'standalone'>('zone')
  const [zoneId, setZoneId] = useState<string>(zones[0]?.id ?? '')
  const [siteId, setSiteId] = useState<string>('')
  const [periodYear, setPeriodYear] = useState<number>(CURRENT_YEAR)
  const [periodMonth, setPeriodMonth] = useState<number>(new Date().getMonth() + 1)
  const [file, setFile] = useState<File | null>(null)

  const [isParsing, setIsParsing] = useState(false)
  const [parseError, setParseError] = useState<string | null>(null)
  const [parseResult, setParseResult] = useState<ParseResponseBody | null>(null)
  const [resolutions, setResolutions] = useState<Record<string, SiteResolution>>({})
  const [isConfirming, setIsConfirming] = useState(false)

  const monthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', { month: 'long' }),
    [locale],
  )

  const standaloneSites = sites.filter((s) => s.zoneId === null)
  const zoneScopedSites = sites.filter((s) => s.zoneId === zoneId)

  async function handleParse() {
    if (!file) return
    setIsParsing(true)
    setParseError(null)

    const formData = new FormData()
    formData.set('file', file)
    formData.set('scope', scope)
    if (scope === 'zone') formData.set('zoneId', zoneId)
    if (scope === 'standalone') formData.set('siteId', siteId)
    formData.set('periodYear', String(periodYear))
    formData.set('periodMonth', String(periodMonth))

    try {
      const res = await fetch('/api/imports/parse', { method: 'POST', body: formData })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'parse failed')

      const result = body as ParseResponseBody
      setParseResult(result)

      const initialResolutions: Record<string, SiteResolution> = {}
      for (const sheet of result.sheets) {
        if (!sheet.headerFound || !sheet.proposal) continue
        initialResolutions[sheet.sheetName] =
          sheet.proposal.kind === 'create_new'
            ? { kind: 'create_new', nameAr: sheet.proposal.suggestedNameAr, sheetKey: sheet.sheetName }
            : { kind: 'existing', siteId: sheet.proposal.site.id }
      }
      setResolutions(initialResolutions)
    } catch (err) {
      setParseError(err instanceof Error ? err.message : t('imports.parseError'))
    } finally {
      setIsParsing(false)
    }
  }

  async function handleConfirm() {
    if (!parseResult) return
    setIsConfirming(true)

    const sheetsToSubmit = parseResult.sheets
      .filter((s) => s.headerFound && resolutions[s.sheetName])
      .map((s) => ({ sheetName: s.sheetName, resolution: resolutions[s.sheetName], rows: s.rows }))

    try {
      const res = await fetch('/api/imports/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchId: parseResult.batchId,
          periodYear,
          periodMonth,
          zoneId: scope === 'zone' ? zoneId : null,
          sheets: sheetsToSubmit,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error ?? 'confirm failed')

      toast.success(t('imports.confirmSuccess'))
      router.push('/dashboard/imports')
      router.refresh()
    } catch {
      toast.error(t('imports.confirmError'))
    } finally {
      setIsConfirming(false)
    }
  }

  if (parseResult) {
    const reviewSites = scope === 'zone' ? zoneScopedSites : standaloneSites
    return (
      <div className="flex flex-col gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('imports.reviewTitle')}</h2>
          <p className="text-sm text-muted-foreground">{t('imports.reviewSubtitle')}</p>
        </div>

        {parseResult.workbookWarnings.length > 0 ? (
          <Card className="border-warning/40 bg-warning/5">
            <CardContent className="py-3 text-xs text-muted-foreground">
              {parseResult.workbookWarnings.join(' · ')}
            </CardContent>
          </Card>
        ) : null}

        <SheetMappingReview
          sheets={parseResult.sheets}
          sites={reviewSites}
          resolutions={resolutions}
          onResolutionChange={(sheetName, resolution) =>
            setResolutions((prev) => ({ ...prev, [sheetName]: resolution }))
          }
        />

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setParseResult(null)
              setResolutions({})
            }}
          >
            {t('common.back')}
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={isConfirming}>
            {isConfirming ? t('imports.confirming') : t('imports.confirmImportButton')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>{t('imports.scope')}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>{t('imports.scope')}</Label>
          <Select value={scope} onValueChange={(v) => setScope(v as 'zone' | 'standalone')}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="zone">{t('imports.scopeZone')}</SelectItem>
              <SelectItem value="standalone">{t('imports.scopeStandalone')}</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {scope === 'zone' ? (
          <div className="flex flex-col gap-1.5">
            <Label>{t('imports.zone')}</Label>
            <Select value={zoneId} onValueChange={setZoneId}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {zones.map((z) => (
                  <SelectItem key={z.id} value={z.id}>
                    {locale === 'ar' ? z.nameAr : z.nameEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <Label>{t('imports.site')}</Label>
            <Select value={siteId} onValueChange={setSiteId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('imports.site')} />
              </SelectTrigger>
              <SelectContent>
                {standaloneSites.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    <span dir="auto">{locale === 'ar' ? s.nameAr : (s.nameEn ?? s.nameAr)}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex gap-3">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{t('imports.month')}</Label>
            <Select value={String(periodMonth)} onValueChange={(v) => setPeriodMonth(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {monthFmt.format(new Date(2000, m - 1, 1))}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label>{t('imports.year')}</Label>
            <Select value={String(periodYear)} onValueChange={(v) => setPeriodYear(Number(v))}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="workbook-file">{t('imports.file')}</Label>
          <Input
            id="workbook-file"
            type="file"
            accept=".xlsx"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        {parseError ? <p className="text-sm text-destructive">{parseError}</p> : null}

        <Button
          type="button"
          onClick={handleParse}
          disabled={!file || isParsing || (scope === 'zone' ? !zoneId : !siteId)}
        >
          {isParsing ? t('imports.parsing') : t('imports.parseButton')}
        </Button>
      </CardContent>
    </Card>
  )
}
