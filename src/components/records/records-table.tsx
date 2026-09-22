'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from '@/components/i18n/i18n-provider'
import { formatCurrency, periodLabel } from '@/lib/format'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RowDetailDialog } from './row-detail-dialog'
import type { PayrollLinesPage } from '@/lib/queries/payroll-lines'
import type { TranslationKey } from '@/lib/i18n/get-dictionary'
import type { RowKind } from '@/lib/import/types'

const ROW_KIND_VARIANT: Record<RowKind, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  worker: 'default',
  subtotal: 'secondary',
  non_worker_cost: 'outline',
  unknown: 'destructive',
}

const ROW_KIND_LABEL_KEY: Record<RowKind, TranslationKey> = {
  worker: 'records.rowKind.worker',
  subtotal: 'records.rowKind.subtotal',
  non_worker_cost: 'records.rowKind.non_worker_cost',
  unknown: 'records.rowKind.unknown',
}

export function RecordsTable({ data }: { data: PayrollLinesPage }) {
  const { t, locale } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [selected, setSelected] = useState<PayrollLinesPage['rows'][number] | null>(null)

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize))

  function goToPage(page: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(page))
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('records.col.worker')}</TableHead>
              <TableHead className="hidden sm:table-cell">{t('records.col.workerNumber')}</TableHead>
              <TableHead>{t('records.col.site')}</TableHead>
              <TableHead className="hidden md:table-cell">{t('records.col.period')}</TableHead>
              <TableHead className="hidden lg:table-cell">{t('records.col.kind')}</TableHead>
              <TableHead className="text-end">{t('records.col.netSalary')}</TableHead>
              <TableHead className="hidden text-end sm:table-cell">{t('records.col.totalGross')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-sm text-muted-foreground">
                  {t('common.noResults')}
                </TableCell>
              </TableRow>
            ) : (
              data.rows.map((row) => (
                <TableRow
                  key={row.id}
                  className="cursor-pointer"
                  onClick={() => setSelected(row)}
                >
                  <TableCell dir="auto" className="max-w-[180px] truncate font-medium">
                    {row.worker_name || '—'}
                  </TableCell>
                  <TableCell className="hidden tabular-nums sm:table-cell" dir="ltr">
                    {row.worker_number ?? '—'}
                  </TableCell>
                  <TableCell dir="auto" className="max-w-[160px] truncate">
                    {locale === 'ar' ? row.pv_sites?.name_ar : row.pv_sites?.name_en ?? row.pv_sites?.name_ar}
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    {periodLabel(row.period_year, row.period_month, locale)}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <Badge variant={ROW_KIND_VARIANT[row.row_kind]}>{t(ROW_KIND_LABEL_KEY[row.row_kind])}</Badge>
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{formatCurrency(row.net_salary, locale)}</TableCell>
                  <TableCell className="hidden text-end tabular-nums sm:table-cell">
                    {formatCurrency(row.total_gross, locale)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {data.total > 0 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {t('common.page')} {data.page} {t('common.of')} {totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => goToPage(data.page - 1)}
            >
              <ChevronLeft className="size-4 rtl:rotate-180" />
              {t('common.previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= totalPages}
              onClick={() => goToPage(data.page + 1)}
            >
              {t('common.next')}
              <ChevronRight className="size-4 rtl:rotate-180" />
            </Button>
          </div>
        </div>
      ) : null}

      <RowDetailDialog row={selected} open={selected !== null} onOpenChange={(open) => !open && setSelected(null)} />
    </div>
  )
}
