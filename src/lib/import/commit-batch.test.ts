import { describe, expect, it } from 'vitest'
import { commitImportBatch, type CommitBatchClient, type NewBatchRow, type NewPayrollLineRow } from './commit-batch'
import type { ParsedPayrollLine } from './types'

function makeLine(overrides: Partial<ParsedPayrollLine> = {}): ParsedPayrollLine {
  return {
    sheetName: 'SiteA',
    sourceRowNumber: 4,
    rowKind: 'worker',
    workerNumber: '1',
    workerName: 'محمد أحمد',
    attendanceDays: null,
    absenceDays: null,
    netDays: null,
    monthlyLeaveDays: null,
    annualLeaveDays: null,
    absenceNoPermissionDays: null,
    overtimeHours: null,
    lessHours: null,
    leaveLabelRaw: null,
    baseMonthlySalary: 3000,
    dailyWage: null,
    bonuses: null,
    transportationAmount: null,
    transportationCategory: null,
    advance: null,
    deductions: null,
    insurance: null,
    totalGross: 3200,
    netSalary: null,
    signatureNotes: null,
    rawRow: { 'الاسم': 'محمد أحمد' },
    ...overrides,
  }
}

/** In-memory fake CommitBatchClient recording every call, so the commit
 * orchestration logic is tested without a live database. */
function makeFakeClient() {
  const batches: NewBatchRow[] = []
  const insertedLineChunks: NewPayrollLineRow[][] = []
  const activated: string[] = []
  let nextId = 1

  const client: CommitBatchClient = {
    async insertBatch(row) {
      batches.push(row)
      return { id: `batch-${nextId++}` }
    },
    async insertPayrollLines(rows) {
      insertedLineChunks.push(rows)
    },
    async activateBatch(batchId) {
      activated.push(batchId)
    },
  }

  return { client, batches, insertedLineChunks, activated }
}

describe('commitImportBatch', () => {
  it('creates one processing batch row scoped to a zone, inserts every sheet\'s lines against it, then activates it', async () => {
    const { client, batches, insertedLineChunks, activated } = makeFakeClient()

    const result = await commitImportBatch(client, {
      scope: { zoneId: 'zone-1' },
      periodYear: 2026,
      periodMonth: 7,
      sourceFilename: 'october-july.xlsx',
      uploadedBy: 'user-1',
      sheetReport: { sheets: ['SiteA', 'SiteB'] },
      warnings: [],
      sheets: [
        { sheetName: 'SiteA', siteId: 'site-a', rows: [makeLine({ sourceRowNumber: 4 }), makeLine({ sourceRowNumber: 6 })] },
        { sheetName: 'SiteB', siteId: 'site-b', rows: [makeLine({ sheetName: 'SiteB', sourceRowNumber: 2 })] },
      ],
    })

    expect(batches).toHaveLength(1)
    expect(batches[0]).toMatchObject({
      zone_id: 'zone-1',
      scope_site_id: null,
      period_year: 2026,
      period_month: 7,
      source_filename: 'october-july.xlsx',
      uploaded_by: 'user-1',
      status: 'processing',
    })

    const allLines = insertedLineChunks.flat()
    expect(allLines).toHaveLength(3)
    expect(allLines.filter((l) => l.site_id === 'site-a')).toHaveLength(2)
    expect(allLines.filter((l) => l.site_id === 'site-b')).toHaveLength(1)
    expect(allLines.every((l) => l.batch_id === result.batchId)).toBe(true)
    expect(allLines.every((l) => l.period_year === 2026 && l.period_month === 7)).toBe(true)

    expect(activated).toEqual([result.batchId])
  })

  it('sets scope_site_id (not zone_id) for a standalone-site scope', async () => {
    const { client, batches } = makeFakeClient()

    await commitImportBatch(client, {
      scope: { siteId: 'futtaim-site' },
      periodYear: 2026,
      periodMonth: 7,
      sourceFilename: 'futtaim-july.xlsx',
      uploadedBy: null,
      sheetReport: {},
      warnings: [],
      sheets: [{ sheetName: 'Futtaim', siteId: 'futtaim-site', rows: [makeLine({ sheetName: 'Futtaim' })] }],
    })

    expect(batches[0].zone_id).toBeNull()
    expect(batches[0].scope_site_id).toBe('futtaim-site')
  })

  it('preserves raw_row and row_kind on every inserted line', async () => {
    const { client, insertedLineChunks } = makeFakeClient()

    await commitImportBatch(client, {
      scope: { zoneId: 'zone-1' },
      periodYear: 2026,
      periodMonth: 7,
      sourceFilename: 'x.xlsx',
      uploadedBy: null,
      sheetReport: {},
      warnings: [],
      sheets: [
        {
          sheetName: 'SiteA',
          siteId: 'site-a',
          rows: [makeLine({ rowKind: 'unknown', rawRow: { 'عمود غريب': 'قيمة' } })],
        },
      ],
    })

    const [line] = insertedLineChunks.flat()
    expect(line.row_kind).toBe('unknown')
    expect(line.raw_row).toEqual({ 'عمود غريب': 'قيمة' })
  })

  it('still creates and activates a batch when a sheet has zero rows', async () => {
    const { client, insertedLineChunks, activated } = makeFakeClient()

    const result = await commitImportBatch(client, {
      scope: { zoneId: 'zone-1' },
      periodYear: 2026,
      periodMonth: 7,
      sourceFilename: 'x.xlsx',
      uploadedBy: null,
      sheetReport: {},
      warnings: [],
      sheets: [{ sheetName: 'EmptySite', siteId: 'site-empty', rows: [] }],
    })

    expect(insertedLineChunks.flat()).toHaveLength(0)
    expect(activated).toEqual([result.batchId])
  })
})
