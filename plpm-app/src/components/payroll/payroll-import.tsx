'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { parsePayrollWorkbook, toImportRows, type ParsedSheet, type ParsedWorkbook } from '@/lib/import/payroll-workbook'
import { matchSheetToSite, type SiteRef } from '@/lib/import/match-sites'
import {
  Upload, FileSpreadsheet, AlertTriangle, XCircle, CheckCircle2, Info, Lock, ArrowRight,
} from 'lucide-react'

export interface ExistingPeriod {
  id: string
  site_id: string
  status: string
  rowCount: number
  total_net: number
}

type CommitResult =
  | { sheetName: string; ok: true; periodId: string; inserted: number; replaced: number }
  | { sheetName: string; ok: false; message: string }

const LOCKED_STATUSES = ['submitted', 'approved']

export function PayrollImport({ sites, month, year, existing }: {
  sites: SiteRef[]
  month: number
  year: number
  existing: ExistingPeriod[]
}) {
  const [workbook, setWorkbook] = useState<ParsedWorkbook | null>(null)
  const [assignments, setAssignments] = useState<Record<string, string>>({})
  const [excluded, setExcluded] = useState<Record<string, boolean>>({})
  const [parsing, setParsing] = useState(false)
  const [fileError, setFileError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState<CommitResult[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const toast = useToast()

  const periodBySite = useMemo(
    () => new Map(existing.map(p => [p.site_id, p])),
    [existing],
  )

  async function handleFile(file: File) {
    setParsing(true)
    setFileError('')
    setResults(null)
    setWorkbook(null)
    try {
      const buffer = await file.arrayBuffer()
      const parsed = await parsePayrollWorkbook(buffer, file.name)
      const nextAssignments: Record<string, string> = {}
      for (const sheet of parsed.sheets) {
        const match = matchSheetToSite(sheet.sheetName, sites)
        nextAssignments[sheet.sheetName] = match.site?.id ?? ''
      }
      setWorkbook(parsed)
      setAssignments(nextAssignments)
      setExcluded({})
    } catch (err) {
      setFileError(
        err instanceof Error
          ? `That file could not be read as an Excel workbook (${err.message}). Save it as .xlsx and try again.`
          : 'That file could not be read as an Excel workbook.',
      )
    } finally {
      setParsing(false)
    }
  }

  /** Sites claimed by more than one worksheet — always an operator mistake. */
  const doubleBooked = useMemo(() => {
    const counts = new Map<string, number>()
    for (const [sheetName, siteId] of Object.entries(assignments)) {
      if (!siteId || excluded[sheetName]) continue
      const sheet = workbook?.sheets.find(s => s.sheetName === sheetName)
      if (!sheet || sheet.blocked || sheet.skipped) continue
      counts.set(siteId, (counts.get(siteId) ?? 0) + 1)
    }
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([id]) => id))
  }, [assignments, excluded, workbook])

  function statusOf(sheet: ParsedSheet): {
    importable: boolean
    reason: string | null
    tone: 'ready' | 'blocked' | 'locked' | 'skipped' | 'unassigned' | 'off'
  } {
    if (sheet.skipped) return { importable: false, reason: 'Not a payroll sheet', tone: 'skipped' }
    if (sheet.blocked) return { importable: false, reason: 'Errors must be fixed in the file', tone: 'blocked' }
    if (excluded[sheet.sheetName]) return { importable: false, reason: 'Excluded by you', tone: 'off' }
    const siteId = assignments[sheet.sheetName]
    if (!siteId) return { importable: false, reason: 'Choose which site this is', tone: 'unassigned' }
    if (doubleBooked.has(siteId)) return { importable: false, reason: 'Two sheets point at this site', tone: 'blocked' }
    const period = periodBySite.get(siteId)
    if (period && LOCKED_STATUSES.includes(period.status)) {
      return { importable: false, reason: `Sheet is already ${period.status}`, tone: 'locked' }
    }
    return { importable: true, reason: null, tone: 'ready' }
  }

  const selected = (workbook?.sheets ?? []).filter(s => statusOf(s).importable)
  const totalRows = selected.reduce((s, sheet) => s + sheet.rows.length, 0)
  const totalGross = selected.reduce((s, sheet) => s + sheet.sumGross, 0)
  const totalNet = selected.reduce((s, sheet) => s + sheet.sumNet, 0)
  const replacing = selected.filter(s => {
    const period = periodBySite.get(assignments[s.sheetName])
    return period != null && period.rowCount > 0
  })

  async function runImport() {
    setConfirmOpen(false)
    setImporting(true)
    setProgress(0)
    const supabase = createClient()
    const collected: CommitResult[] = []

    for (const sheet of selected) {
      const siteId = assignments[sheet.sheetName]
      const { data, error } = await supabase.rpc('import_payroll_sheet', {
        p_site_id: siteId,
        p_month: month,
        p_year: year,
        p_rows: toImportRows(sheet),
      })
      if (error) {
        collected.push({ sheetName: sheet.sheetName, ok: false, message: error.message })
      } else {
        const payload = data as { period_id: string; inserted: number; replaced: number }
        collected.push({
          sheetName: sheet.sheetName, ok: true,
          periodId: payload.period_id, inserted: payload.inserted, replaced: payload.replaced,
        })
      }
      setProgress(collected.length)
      setResults([...collected])
    }

    setImporting(false)
    const failed = collected.filter(r => !r.ok).length
    if (failed === 0) toast(`Imported ${collected.length} sheet${collected.length === 1 ? '' : 's'}`)
    else toast(`${failed} sheet${failed === 1 ? '' : 's'} could not be imported`, 'error')
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* ---- Upload ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-blue-600" />
            Upload the {formatMonthYear(month, year)} workbook
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">
            One .xlsx file with a tab per site. Each tab is read exactly as it stands — every figure
            is stored as the sheet has it, and nothing is recalculated. Each tab is checked against
            its own totals row before anything can be imported, and you review every sheet below
            before a single row is written.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={e => {
                const file = e.target.files?.[0]
                if (file) void handleFile(file)
                e.target.value = ''
              }}
            />
            <Button onClick={() => inputRef.current?.click()} loading={parsing} disabled={importing}>
              <FileSpreadsheet className="h-4 w-4" /> Choose Excel file
            </Button>
            {workbook && (
              <span className="text-sm text-gray-600">
                {workbook.fileName} — {workbook.sheets.length} tab{workbook.sheets.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {fileError && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">{fileError}</div>
          )}
        </CardContent>
      </Card>

      {/* ---- Review ---- */}
      {workbook && (
        <Card>
          <CardHeader>
            <CardTitle>Review before importing</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {workbook.sheets.map(sheet => {
                const state = statusOf(sheet)
                const siteId = assignments[sheet.sheetName]
                const period = siteId ? periodBySite.get(siteId) : undefined
                const errs = sheet.issues.filter(i => i.severity === 'error')
                const warns = sheet.issues.filter(i => i.severity === 'warning')
                return (
                  <div key={sheet.sheetName} className="px-5 py-4 space-y-3">
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-[220px]">
                        <div className="flex items-center gap-2">
                          <TonePill tone={state.tone} />
                          <span className="font-medium text-gray-900">{sheet.sheetName}</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">
                          {sheet.skipped
                            ? 'No payroll table on this tab'
                            : `${sheet.rows.length} row${sheet.rows.length === 1 ? '' : 's'} · gross ${formatCurrency(sheet.sumGross)} · net ${formatCurrency(sheet.sumNet)}`}
                        </p>
                      </div>

                      {!sheet.skipped && (
                        <div className="flex items-center gap-3 flex-wrap">
                          <label className="sr-only" htmlFor={`site-${sheet.sheetName}`}>
                            Site for {sheet.sheetName}
                          </label>
                          <select
                            id={`site-${sheet.sheetName}`}
                            value={siteId ?? ''}
                            disabled={importing}
                            onChange={e => setAssignments(a => ({ ...a, [sheet.sheetName]: e.target.value }))}
                            className="h-8 border border-gray-300 rounded-lg px-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[220px]"
                          >
                            <option value="">— choose a site —</option>
                            {sites.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.name}{s.sheet_key ? ` (${s.sheet_key})` : ''}
                              </option>
                            ))}
                          </select>
                          <label className="flex items-center gap-2 text-sm text-gray-600">
                            <input
                              type="checkbox"
                              checked={!excluded[sheet.sheetName]}
                              disabled={importing || sheet.blocked}
                              onChange={e => setExcluded(x => ({ ...x, [sheet.sheetName]: !e.target.checked }))}
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            Import
                          </label>
                        </div>
                      )}
                    </div>

                    {period && (
                      <p className="text-xs text-gray-600 flex items-center gap-1.5">
                        {LOCKED_STATUSES.includes(period.status)
                          ? <Lock className="h-3.5 w-3.5 text-amber-600" />
                          : <Info className="h-3.5 w-3.5 text-blue-500" />}
                        This site already has a {period.status} sheet for {formatMonthYear(month, year)} with{' '}
                        {period.rowCount} row{period.rowCount === 1 ? '' : 's'} (net {formatCurrency(period.total_net)}).
                        {LOCKED_STATUSES.includes(period.status)
                          ? ' It will not be touched — reset it to draft first if you meant to replace it.'
                          : ' Importing replaces those rows.'}
                      </p>
                    )}

                    {state.reason && !sheet.skipped && (
                      <p className="text-xs font-medium text-gray-500">{state.reason}</p>
                    )}

                    {errs.map((issue, i) => (
                      <p key={`e${i}`} className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2">
                        <XCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{issue.message}</span>
                      </p>
                    ))}
                    {warns.map((issue, i) => (
                      <p key={`w${i}`} className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
                        <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" /> <span>{issue.message}</span>
                      </p>
                    ))}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Commit bar ---- */}
      {workbook && (
        <Card>
          <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">{selected.length}</span> sheet{selected.length === 1 ? '' : 's'} ready ·{' '}
              <span className="font-semibold">{totalRows}</span> rows · gross{' '}
              <span className="font-mono">{formatCurrency(totalGross)}</span> · net{' '}
              <span className="font-mono font-semibold text-green-700">{formatCurrency(totalNet)}</span>
              {replacing.length > 0 && (
                <span className="block text-xs text-amber-700 mt-1">
                  {replacing.length} of these will replace rows already in the system.
                </span>
              )}
            </div>
            <Button onClick={() => setConfirmOpen(true)} disabled={selected.length === 0 || importing} loading={importing}>
              {importing ? `Importing ${progress}/${selected.length}…` : `Import ${selected.length} sheet${selected.length === 1 ? '' : 's'}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ---- Results ---- */}
      {results && results.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Import result</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-gray-100">
              {results.map(result => (
                <div key={result.sheetName} className="px-5 py-3 flex items-start gap-2 text-sm">
                  {result.ok
                    ? <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                    : <XCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{result.sheetName}</span>
                    {result.ok ? (
                      <>
                        <span className="text-gray-600">
                          {' '}— {result.inserted} rows written
                          {result.replaced > 0 ? `, replacing ${result.replaced}` : ''}.
                        </span>
                        <Link
                          href={`/dashboard/payroll/${result.periodId}`}
                          className="ml-2 text-blue-600 hover:underline inline-flex items-center gap-1"
                        >
                          Open sheet <ArrowRight className="h-3 w-3" />
                        </Link>
                      </>
                    ) : (
                      <span className="text-red-700"> — {result.message}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Import these sheets?" size="lg">
        <div className="space-y-4 text-sm text-gray-700">
          <p>
            {selected.length} sheet{selected.length === 1 ? '' : 's'} will be written to{' '}
            <strong>{formatMonthYear(month, year)}</strong>: {totalRows} rows, net{' '}
            <strong className="font-mono">{formatCurrency(totalNet)}</strong>.
          </p>
          {replacing.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-amber-900">
              <p className="font-medium mb-1">Existing rows will be replaced for:</p>
              <ul className="list-disc pl-5 space-y-0.5">
                {replacing.map(s => {
                  const period = periodBySite.get(assignments[s.sheetName])!
                  const site = sites.find(x => x.id === assignments[s.sheetName])
                  return (
                    <li key={s.sheetName}>
                      {site?.name} — {period.rowCount} existing row{period.rowCount === 1 ? '' : 's'} removed,{' '}
                      {s.rows.length} written from &ldquo;{s.sheetName}&rdquo;
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Each sheet is written in one go — a sheet either lands completely or not at all.
            Imported sheets arrive as drafts, so nothing reaches approval without you sending it.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={runImport}>Import {selected.length} sheet{selected.length === 1 ? '' : 's'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function TonePill({ tone }: { tone: 'ready' | 'blocked' | 'locked' | 'skipped' | 'unassigned' | 'off' }) {
  const map = {
    ready: { label: 'Ready', className: 'bg-green-100 text-green-700' },
    blocked: { label: 'Errors', className: 'bg-red-100 text-red-700' },
    locked: { label: 'Locked', className: 'bg-amber-100 text-amber-800' },
    skipped: { label: 'Skipped', className: 'bg-gray-100 text-gray-600' },
    unassigned: { label: 'No site', className: 'bg-blue-100 text-blue-700' },
    off: { label: 'Excluded', className: 'bg-gray-100 text-gray-600' },
  } as const
  const { label, className } = map[tone]
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${className}`}>{label}</span>
}
