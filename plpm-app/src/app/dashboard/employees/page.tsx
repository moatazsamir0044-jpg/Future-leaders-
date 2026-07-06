import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { EmployeeManager } from '@/components/employees/employee-manager'
import { Users } from 'lucide-react'

export default async function EmployeesPage() {
  const supabase = await createClient()

  const [{ data: employees }, { data: sites }] = await Promise.all([
    supabase.from('employees')
      .select('*, site:sites(id, name, service_type)')
      .order('site_id')
      .order('worker_number'),
    supabase.from('sites').select('*').eq('active', true).order('sort_order'),
  ])

  const active = (employees ?? []).filter(e => e.active)
  const avgSalary = active.length > 0
    ? active.reduce((s, e) => s + Number(e.base_monthly_salary), 0) / active.length
    : 0

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Employees</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage employee records across all sites</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Employees', value: String(active.length), color: 'text-gray-900' },
          { label: 'Sites', value: String((sites ?? []).length), color: 'text-blue-600' },
          { label: 'Avg. Monthly Salary', value: `EGP ${formatCurrency(avgSalary)}`, color: 'text-gray-900' },
        ].map(({ label, value, color }) => (
          <Card key={label} className="p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-600" /> Employee Records
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <EmployeeManager employees={employees ?? []} sites={sites ?? []} />
        </CardContent>
      </Card>
    </div>
  )
}
