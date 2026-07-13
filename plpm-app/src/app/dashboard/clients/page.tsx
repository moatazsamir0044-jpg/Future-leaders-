import { createClient } from '@/lib/supabase/server'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ClientManager } from '@/components/finance/client-manager'
import { ContractManager } from '@/components/finance/contract-manager'
import { Briefcase, ScrollText } from 'lucide-react'

export default async function ClientsPage() {
  const supabase = await createClient()

  const [{ data: clients }, { data: contracts }, { data: sites }] = await Promise.all([
    supabase.from('clients').select('*').order('name'),
    supabase.from('contracts')
      .select('*, client:clients(id, name, name_ar), contract_sites(site_id, site:sites(id, name))')
      .order('name'),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Clients & Contracts</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Client entities you bill, and the contracts each invoice is issued against — one invoice per contract per month.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-blue-600" />
            Clients
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ClientManager clients={clients ?? []} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScrollText className="h-4 w-4 text-blue-600" />
            Contracts
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ContractManager contracts={contracts ?? []} clients={clients ?? []} sites={sites ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
