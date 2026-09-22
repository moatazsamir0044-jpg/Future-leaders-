'use client'

import { useState } from 'react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { formatCurrency, formatNumber, periodLabel } from '@/lib/format'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { PayrollLineRow } from '@/lib/queries/payroll-lines'
import type { TranslationKey } from '@/lib/i18n/get-dictionary'
import type { RowKind } from '@/lib/import/types'

const ROW_KIND_LABEL_KEY: Record<RowKind, TranslationKey> = {
  worker: 'records.rowKind.worker',
  subtotal: 'records.rowKind.subtotal',
  non_worker_cost: 'records.rowKind.non_worker_cost',
  unknown: 'records.rowKind.unknown',
}

function Field({ label, value, dir }: { label: string; value: string | number | null; dir?: 'auto' | 'ltr' }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums" dir={dir}>
        {value}
      </span>
    </div>
  )
}

export function RowDetailDialog({
  row,
  open,
  onOpenChange,
}: {
  row: PayrollLineRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t, locale } = useTranslation()
  const [showRaw, setShowRaw] = useState(false)

  if (!row) return null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setShowRaw(false)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle dir="auto">{row.worker_name ?? t('records.detail.title')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{t(ROW_KIND_LABEL_KEY[row.row_kind])}</Badge>
          <span className="text-xs text-muted-foreground">
            {periodLabel(row.period_year, row.period_month, locale)} · {row.sheet_name} ·{' '}
            {t('records.detail.sourceRow')} {row.source_row_number}
          </span>
        </div>

        {row.row_kind === 'subtotal' ? (
          <p className="border-t pt-4 text-sm text-muted-foreground">{t('records.detail.subtotalNote')}</p>
        ) : null}

        <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4 sm:grid-cols-3">
          <Field label={t('records.col.workerNumber')} value={row.worker_number} dir="ltr" />
          <Field label={t('records.col.site')} value={locale === 'ar' ? row.pv_sites?.name_ar ?? null : row.pv_sites?.name_en ?? row.pv_sites?.name_ar ?? null} dir="auto" />
          <Field label={t('records.detail.attendanceDays')} value={formatNumber(row.attendance_days, locale)} />
          <Field label={t('records.detail.absenceDays')} value={formatNumber(row.absence_days, locale)} />
          <Field label={t('records.detail.netDays')} value={formatNumber(row.net_days, locale)} />
          <Field label={t('records.detail.overtimeHours')} value={formatNumber(row.overtime_hours, locale)} />
          <Field label={t('records.detail.annualLeaveDays')} value={formatNumber(row.annual_leave_days, locale)} />
          <Field label={t('records.detail.leaveLabelRaw')} value={row.leave_label_raw} dir="auto" />
          <Field label={t('records.col.baseSalary')} value={formatCurrency(row.base_monthly_salary, locale)} />
          <Field label={t('records.col.bonuses')} value={formatCurrency(row.bonuses, locale)} />
          <Field label={t('records.detail.transportation')} value={formatCurrency(row.transportation_amount, locale)} />
          <Field label={t('records.detail.advance')} value={formatCurrency(row.advance, locale)} />
          <Field label={t('records.col.deductions')} value={formatCurrency(row.deductions, locale)} />
          <Field label={t('records.detail.insurance')} value={formatCurrency(row.insurance, locale)} />
          <Field label={t('records.col.totalGross')} value={formatCurrency(row.total_gross, locale)} />
          <Field label={t('records.col.netSalary')} value={formatCurrency(row.net_salary, locale)} />
          <Field label={t('records.detail.signatureNotes')} value={row.signature_notes} dir="auto" />
        </div>

        <div className="border-t pt-4">
          <Button type="button" variant="outline" size="sm" onClick={() => setShowRaw((v) => !v)}>
            {showRaw ? t('common.hideRawJson') : t('common.showRawJson')}
          </Button>
          {showRaw ? (
            <pre
              dir="ltr"
              className="mt-3 max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs leading-relaxed"
            >
              {JSON.stringify(row.raw_row, null, 2)}
            </pre>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  )
}
