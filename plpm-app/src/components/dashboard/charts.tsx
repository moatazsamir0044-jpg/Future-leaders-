'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, serviceTypeLabel } from '@/lib/utils'

interface Props {
  payrollPeriods: Array<{ site?: { name: string; service_type: string }; total_net: number; total_gross: number; status: string }>
  expenseReports: Array<{ site?: { name: string; service_type: string }; grand_total: number; status: string }>
}

export function DashboardCharts({ payrollPeriods, expenseReports }: Props) {
  const payrollData = payrollPeriods
    .filter(p => p.site)
    .slice(0, 12)
    .map(p => ({
      name: (p.site as { name: string }).name.length > 14
        ? (p.site as { name: string }).name.substring(0, 14) + '…'
        : (p.site as { name: string }).name,
      'Net Salary': Number(p.total_net),
      'Gross Total': Number(p.total_gross),
    }))

  const expenseData = expenseReports
    .filter(e => e.site)
    .slice(0, 12)
    .map(e => ({
      name: (e.site as { name: string }).name.length > 14
        ? (e.site as { name: string }).name.substring(0, 14) + '…'
        : (e.site as { name: string }).name,
      'Grand Total': Number(e.grand_total),
    }))

  if (payrollData.length === 0 && expenseData.length === 0) return null

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      {payrollData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Payroll by Site</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={payrollData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v)} width={80} />
                <Tooltip formatter={(v: number) => `EGP ${formatCurrency(v)}`} />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="Net Salary" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                <Bar dataKey="Gross Total" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
      {expenseData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses by Site</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={expenseData} margin={{ top: 4, right: 8, left: 0, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => formatCurrency(v)} width={80} />
                <Tooltip formatter={(v: number) => `EGP ${formatCurrency(v)}`} />
                <Legend wrapperStyle={{ paddingTop: 12 }} />
                <Bar dataKey="Grand Total" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
