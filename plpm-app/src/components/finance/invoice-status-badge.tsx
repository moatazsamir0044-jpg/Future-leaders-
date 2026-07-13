import { Badge } from '@/components/ui/badge'
import { INVOICE_STATUS_LABELS, type InvoiceStatus } from '@/types'

const VARIANTS: Record<InvoiceStatus, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  draft: 'default',
  agreed: 'info',
  sent_to_accountant: 'info',
  issued: 'warning',
  sent_to_client: 'warning',
  collected: 'success',
}

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return <Badge variant={VARIANTS[status] ?? 'default'}>{INVOICE_STATUS_LABELS[status] ?? status}</Badge>
}
