'use client'

import { useCallback, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatMonthYear } from '@/lib/utils'
import { MONTHS } from '@/types'
import { readPayrollWorkbook, NUMERIC_FIELDS, round2, type SheetResult } from '@/lib/import/payroll-workbook'
import { Upload, CheckCircle2, AlertTriangle, XCircle, FileSpreadsheet } from 'lucide-react'

interface SiteOption { id: string; name: string; sheet_key: string | null }

/** One worksheet, plus what we worked out about it. */
interface Candidate {
  file: string
  sheet: SheetResult
  siteId: string | null
  siteName: string | null
  blocked: string[]
}

const selectCls = 'h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500'

export function PayrollImporter({ sites }: { sites: SiteOption[] }) {
  const router = useRouter()
  const toast = useToast()

  const now = new Date()
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [year, setYear] = useState(now.getFullYear())
  const [approve, setApprove] = useState(false)
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[] | null>(null)
  const [suggestedMonths, setSuggestedMonths] = useState<number[]>([])
  const [existing, setExisting] = useState<number | null>(null)
  const [done, setDone] = useState<string[] | null>(null)
  const [failed, setFailed] = useState<string[]>([])

  const byKey = useMemo(() => {
    const m = new Map<string, SiteOption>()
    for (const s of sites) {
      if (s.sheet_key) m.set(s.sheet_key.trim().toLowerCase(), s)
    }
    return m
  }, [sites])

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return
    setReading(true)
    setDone(null)
    setFailed([])
    try {
      const found: Candidate[] = []
      const months = new Set<number>()

      for (const file of Array.from(files)) {
        const wb = await readPayrollWorkbook(await file.arrayBuffer())
        wb.monthsSeen.forEach(m => months.add(m))
        for (const sheet of wb.sheets) {
          const site = byKey.get(sheet.sheetName.trim().toLowerCase()) ?? null
          const blocked = [...sheet.errors]
          if (!site) {
            blocked.push(
              `no site is linked to a worksheet called "${sheet.sheetName}" - ` +
              `set that name on the site under Settings, then import again`)
          }
          if (sheet.rows.length === 0) blocked.push('no worker rows found')
          found.push({
            file: file.name,
            sheet,
            siteId: site?.id ?? null,
            siteName: site?.name ?? null,
            blocked,
          })
        }
      }

      // a worksheet appearing twice across the chosen files would import twice
      const seen = new Map<string, number>()
      for (const c of found) {
        if (!c.siteId) continue
        seen.set(c.siteId, (seen.get(c.siteId) ?? 0) + 1)
      }
      for (const c of found) {
        if (c.siteId && (seen.get(c.siteId) ?? 0) > 1) {
          c.blocked.push('this site appears on more than one of the selected files')
        }
      }

      setCandidates(found)
      setSuggestedMonths([...months].sort((a, b) => a - b))
      if (months.size === 1) setMonth([...months][0])
    } catch (e) {
      toast(`Could not read the file: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
      setCandidates(null)
    } finally {
      setReading(false)
    }
  }, [byKey, toast])

  // how much of this month is already in the system
  const checkExisting = useCallback(async () => {
    const supabase = createClient()
    const { count } = await supabase
      .from('payroll_periods')
      .select('id', { count: 'exact', head: true })
      .eq('month', month).eq('year', year)
    setExisting(count ?? 0)
  }, [month, year])

  const ready = (candidates ?? []).filter(c => c.blocked.length === 0)
  const problems = (candidates ?? []).filter(c => c.blocked.length > 0)

  async function handleImport() {
    if (ready.length === 0) return
    setImporting(true)
    const supabase = createClient()
    const ok: string[] = []
    const bad: string[] = []

    for (const c of ready) {
      const rows = c.sheet.rows.map(r => {
        const out: Record<string, string | number | null> = {
          worker_number: r.workerNumber,
          employee_name: r.employeeName,
          notes: r.section,
        }
        for (const f of NUMERIC_FIELDS) out[f] = r.values[f]
        return out
      })
      const { error } = await supabase.rpc('import_site_payroll', {
        p_site_id: c.siteId,
        p_month: month,
        p_year: year,
        p_status: approve ? 'approved' : 'draft',
        // the site total is the figure the sheet itself prints, when it has one
        p_total_gross: round2(c.sheet.printedGross ?? c.sheet.ourGross),
        p_total_net: round2(c.sheet.printedNet ?? c.sheet.ourNet),
        p_rows: rows,
      })
      if (error) bad.push(`${c.siteName}: ${error.message}`)
      else ok.push(`${c.siteName} — ${c.sheet.rows.length} workers`)
    }

    setDone(ok)
    setFailed(bad)
    setImporting(false)
    if (bad.length === 0) {
      toast(`Imported ${ok.length} site${ok.length === 1 ? '' : 's'} for ${formatMonthYear(month, year)}`)
      router.refresh()
    } else {
      toast(`${ok.length} imported, ${bad.length} failed`, 'error')
    }
  }

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - i)

  return (
    <div className="space-y-6">
      {/* Step 1 - choose files */}
      <section className="rounded-xl border border-gray-200 bg-white p-5">
        <h2 className="font-semibold text-gray-900 mb-1">1. Choose the monthly workbooks</h2>
        <p className="text-sm text-gray-500 mb-4">
          Pick the payroll file for the month. You can select both companies&apos; files at once.
          Nothing is saved until you press Import.
        </p>
        <label className="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="file"
            accept=".xlsx"
            multiple
            className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white file:text-sm file:font-medium hover:file:bg-blue-700"
            onChange={e => handleFiles(e.target.files)}
          />
        </label>
        {reading && <p className="text-sm text-gray-500 mt-3">Reading…</p>}
      </section>

      {candidates && (
        <>
          {/* Step 2 - confirm the period */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-1">2. Confirm which month this is</h2>
            <p className="text-sm text-gray-500 mb-4">
              {suggestedMonths.length === 1
                ? `The sheets say ${MONTHS[suggestedMonths[0] - 1]}. Check it is right — a sheet copied from
                   last month often still carries the old month in its title.`
                : suggestedMonths.length > 1
                  ? `The sheets disagree with each other (${suggestedMonths.map(m => MONTHS[m - 1]).join(', ')}),
                     which usually means some were copied from an earlier month without updating the title.
                     Choose the correct one.`
                  : 'The sheets do not name a month. Choose it here.'}
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <select value={month} onChange={e => { setMonth(Number(e.target.value)); setExisting(null) }}
                aria-label="Month" className={selectCls}>
                {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
              </select>
              <select value={year} onChange={e => { setYear(Number(e.target.value)); setExisting(null) }}
                aria-label="Year" className={selectCls}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <Button variant="outline" onClick={checkExisting}>Check what is already there</Button>
            </div>
            {existing !== null && (
              <p className={`text-sm mt-3 ${existing > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                {existing > 0
                  ? `${formatMonthYear(month, year)} already has ${existing} site sheet${existing === 1 ? '' : 's'}.
                     Importing replaces the sheets for the sites in these files; other sites are left alone.`
                  : `Nothing has been imported for ${formatMonthYear(month, year)} yet.`}
              </p>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 mt-4 cursor-pointer">
              <input type="checkbox" checked={approve} onChange={e => setApprove(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              Mark these sheets as approved straight away (otherwise they arrive as drafts to review)
            </label>
          </section>

          {/* Step 3 - what was found */}
          <section className="rounded-xl border border-gray-200 bg-white">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">3. Check what was read</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                Each row was added up and compared with the total printed on that sheet.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-5 py-3 font-medium text-gray-600">Worksheet</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Site</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Workers</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-600">Net (EGP)</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-600">Checks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {candidates.map((c, i) => (
                    <tr key={`${c.file}-${c.sheet.sheetName}-${i}`} className="align-top">
                      <td className="px-5 py-3 font-medium text-gray-900">{c.sheet.sheetName}</td>
                      <td className="px-4 py-3 text-gray-700">{c.siteName ?? <span className="text-red-600">not linked</span>}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{c.sheet.rows.length}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{formatCurrency(c.sheet.ourNet)}</td>
                      <td className="px-4 py-3">
                        {c.blocked.length === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-green-700">
                            <CheckCircle2 className="h-4 w-4" /> matches the sheet total
                          </span>
                        ) : (
                          <ul className="space-y-1">
                            {c.blocked.map((b, j) => (
                              <li key={j} className="flex items-start gap-1.5 text-red-700">
                                <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> <span>{b}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                        {c.sheet.warnings.map((w, j) => (
                          <div key={`w${j}`} className="flex items-start gap-1.5 text-amber-700 mt-1">
                            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" /> <span>{w}</span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Step 4 - import */}
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-semibold text-gray-900 mb-1">4. Import</h2>
            <p className="text-sm text-gray-600 mb-4">
              {ready.length} sheet{ready.length === 1 ? '' : 's'} ready
              {problems.length > 0 && <> · <span className="text-red-700">{problems.length} will be skipped until fixed</span></>}
              {' '}· {formatMonthYear(month, year)}
            </p>
            <Button onClick={handleImport} loading={importing} disabled={ready.length === 0}>
              <Upload className="h-4 w-4" />
              Import {ready.length} sheet{ready.length === 1 ? '' : 's'}
            </Button>

            {done && (
              <div className="mt-4 space-y-1 text-sm">
                {done.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-green-700">
                    <CheckCircle2 className="h-4 w-4" /> {d}
                  </div>
                ))}
                {failed.map((f, i) => (
                  <div key={`f${i}`} className="flex items-start gap-1.5 text-red-700">
                    <XCircle className="h-4 w-4 flex-shrink-0 mt-0.5" /> {f}
                  </div>
                ))}
                {failed.length === 0 && (
                  <p className="text-gray-600 pt-2 flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4 w-4" />
                    Open Payroll and switch to {formatMonthYear(month, year)} to see them.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}
