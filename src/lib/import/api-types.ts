// Shared request/response shapes between the import upload/review UI
// (src/components/imports/*) and its two API routes
// (src/app/api/imports/parse, src/app/api/imports/confirm). Type-only reuse
// keeps the client and server in sync without duplicating the shape by hand.

import type { ParsedPayrollLine, RowKind } from './types'
import type { SiteMatchProposal } from './sheet-site-matching'

export interface ParseResponseSheet {
  sheetName: string
  headerFound: boolean
  headerRowNumber: number | null
  rowCountsByKind: Record<RowKind, number>
  unmappedHeaders: string[]
  warnings: string[]
  foundEndMarker: boolean
  hitSafetyCap: boolean
  proposal: SiteMatchProposal | null
  rows: ParsedPayrollLine[]
}

export interface ParseResponseBody {
  batchId: string
  excludedSheetNames: string[]
  workbookWarnings: string[]
  sheets: ParseResponseSheet[]
}

export type SiteResolution =
  | { kind: 'existing'; siteId: string }
  | { kind: 'create_new'; nameAr: string; sheetKey: string }

export interface ConfirmRequestSheet {
  sheetName: string
  resolution: SiteResolution
  rows: ParsedPayrollLine[]
}

export interface ConfirmRequestBody {
  batchId: string
  periodYear: number
  periodMonth: number
  zoneId: string | null
  sheets: ConfirmRequestSheet[]
}
