'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/toast'
import { FileSpreadsheet } from 'lucide-react'
import { exportAccountantPack, type AccountantExportData } from '@/lib/export/accountant'

export function AccountantExportButton({ data }: { data: AccountantExportData }) {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  const isEmpty = data.invoices.length === 0 && data.collections.length === 0
    && data.payroll.length === 0 && data.expenses.length === 0
    && data.advanceRepayments.length === 0 && data.custody.length === 0

  async function handleExport() {
    setExporting(true)
    try {
      await exportAccountantPack(data)
      toast('Accountant pack downloaded')
    } catch (e) {
      toast(`Export failed: ${e instanceof Error ? e.message : 'unknown error'}`, 'error')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Button onClick={handleExport} loading={exporting} disabled={isEmpty}
      title={isEmpty ? 'No data for this month' : undefined}>
      <FileSpreadsheet className="h-4 w-4" /> Download Pack
    </Button>
  )
}
