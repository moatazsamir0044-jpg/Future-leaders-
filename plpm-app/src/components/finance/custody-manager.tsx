'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Modal } from '@/components/ui/modal'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { useToast } from '@/components/ui/toast'
import { formatCurrency, formatMonthYear, getMonthYearOptions, currentMonthYear } from '@/lib/utils'
import { Plus, Wallet, ArrowDownCircle, ArrowUpCircle, Trash2 } from 'lucide-react'
import type { CustodyAccount, CustodyTransaction, CustodyTxnType } from '@/types'

const today = () => new Date().toISOString().slice(0, 10)
const inputCls = 'h-8 border border-gray-300 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500'

function accountBalance(accountId: string, transactions: CustodyTransaction[]): number {
  return transactions
    .filter(t => t.account_id === accountId)
    .reduce((s, t) => s + (t.type === 'top_up' ? Number(t.amount) : -Number(t.amount)), 0)
}

export function CustodyManager({ accounts: initialAccounts, transactions: initialTxns }: {
  accounts: CustodyAccount[]
  transactions: CustodyTransaction[]
}) {
  const router = useRouter()
  const toast = useToast()
  const [accounts, setAccounts] = useState(initialAccounts)
  const [transactions, setTransactions] = useState(initialTxns)
  const [period, setPeriod] = useState(currentMonthYear())

  // Account modal
  const [accountOpen, setAccountOpen] = useState(false)
  const [accountName, setAccountName] = useState('')
  const [accountHolder, setAccountHolder] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState('')

  // Transaction modal
  const [txnOpen, setTxnOpen] = useState(false)
  const [txnAccount, setTxnAccount] = useState('')
  const [txnType, setTxnType] = useState<CustodyTxnType>('expense')
  const [txnAmount, setTxnAmount] = useState('')
  const [txnDate, setTxnDate] = useState(today())
  const [txnPayee, setTxnPayee] = useState('')
  const [txnDescription, setTxnDescription] = useState('')
  const [txnSaving, setTxnSaving] = useState(false)
  const [txnError, setTxnError] = useState('')

  const [deleteTarget, setDeleteTarget] = useState<CustodyTransaction | null>(null)
  const [deleting, setDeleting] = useState(false)

  const monthTxns = transactions.filter(t => {
    const d = new Date(`${t.txn_date}T00:00:00Z`)
    return d.getUTCMonth() + 1 === period.month && d.getUTCFullYear() === period.year
  })
  const monthIn = monthTxns.filter(t => t.type === 'top_up').reduce((s, t) => s + Number(t.amount), 0)
  const monthOut = monthTxns.filter(t => t.type === 'expense').reduce((s, t) => s + Number(t.amount), 0)

  async function handleAddAccount() {
    if (!accountName.trim()) { setAccountError('Name is required'); return }
    setAccountSaving(true); setAccountError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.from('custody_accounts').insert({
      name: accountName.trim(),
      holder: accountHolder.trim() || null,
      active: true,
    }).select().single()
    if (err) { setAccountError(err.message); setAccountSaving(false); return }
    setAccounts(prev => [...prev, data])
    toast(`Custody account "${data.name}" added`)
    setAccountSaving(false); setAccountOpen(false)
    setAccountName(''); setAccountHolder('')
    router.refresh()
  }

  function openTxn(type: CustodyTxnType) {
    setTxnType(type)
    setTxnAccount(accounts.length === 1 ? accounts[0].id : '')
    setTxnAmount(''); setTxnDate(today()); setTxnPayee(''); setTxnDescription(''); setTxnError('')
    setTxnOpen(true)
  }

  async function handleAddTxn() {
    if (!txnAccount) { setTxnError('Select an account'); return }
    const amountNum = parseFloat(txnAmount)
    if (!Number.isFinite(amountNum) || amountNum <= 0) { setTxnError('Enter a valid amount'); return }
    setTxnSaving(true); setTxnError('')
    const supabase = createClient()
    const { data, error: err } = await supabase.from('custody_transactions').insert({
      account_id: txnAccount,
      txn_date: txnDate,
      type: txnType,
      amount: amountNum,
      payee: txnPayee.trim() || null,
      description: txnDescription.trim() || null,
    }).select('*, account:custody_accounts(id, name)').single()
    if (err) { setTxnError(err.message); setTxnSaving(false); return }
    setTransactions(prev => [data, ...prev])
    toast(txnType === 'top_up' ? 'Top-up recorded' : 'Expense recorded')
    setTxnSaving(false); setTxnOpen(false)
    router.refresh()
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    const supabase = createClient()
    const { error: err } = await supabase.from('custody_transactions').delete().eq('id', deleteTarget.id)
    setDeleting(false)
    if (err) { toast(`Could not delete: ${err.message}`, 'error'); return }
    setTransactions(prev => prev.filter(t => t.id !== deleteTarget.id))
    toast('Transaction deleted')
    setDeleteTarget(null)
    router.refresh()
  }

  return (
    <>
      {/* Account balances */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {accounts.map(a => {
          const balance = accountBalance(a.id, transactions)
          return (
            <Card key={a.id} className="p-4">
              <p className="text-xs text-gray-500 uppercase tracking-wide truncate">{a.name}</p>
              <p className={`text-2xl font-bold mt-1 ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                EGP {formatCurrency(balance)}
              </p>
              {a.holder && <p className="text-xs text-gray-400 mt-1">Held by {a.holder}</p>}
            </Card>
          )
        })}
        <button onClick={() => setAccountOpen(true)}
          className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-gray-400 hover:text-blue-600 hover:border-blue-300 transition-colors flex flex-col items-center justify-center gap-1 min-h-[92px]">
          <Plus className="h-5 w-5" />
          <span className="text-sm font-medium">Add custody account</span>
        </button>
      </div>

      {/* Monthly transactions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-blue-600" />
            Transactions — {formatMonthYear(period.month, period.year)}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <select
                value={`${period.month}-${period.year}`}
                onChange={e => {
                  const [m, y] = e.target.value.split('-').map(Number)
                  setPeriod({ month: m, year: y })
                }}
                aria-label="Month"
                className={inputCls}
              >
                {getMonthYearOptions(24).map(o => (
                  <option key={`${o.month}-${o.year}`} value={`${o.month}-${o.year}`}>{o.label}</option>
                ))}
              </select>
              <span className="text-xs text-gray-500">
                In: <span className="font-mono text-green-700">{formatCurrency(monthIn)}</span>
                {' · '}Out: <span className="font-mono text-red-600">{formatCurrency(monthOut)}</span>
                {' · '}Net: <span className={`font-mono ${monthIn - monthOut < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCurrency(monthIn - monthOut)}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={() => openTxn('top_up')} disabled={accounts.length === 0}>
                <ArrowDownCircle className="h-3.5 w-3.5 text-green-600" /> Top-up
              </Button>
              <Button size="sm" onClick={() => openTxn('expense')} disabled={accounts.length === 0}
                title={accounts.length === 0 ? 'Add a custody account first' : undefined}>
                <ArrowUpCircle className="h-3.5 w-3.5" /> Expense
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[680px]">
              <thead>
                <tr className="bg-gray-50/70 border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Date</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Account</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Payee</th>
                  <th className="text-left px-4 py-2.5 font-medium text-gray-600">Description</th>
                  <th className="text-right px-4 py-2.5 font-medium text-gray-600">Amount</th>
                  <th className="px-3 py-2.5 w-12" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {monthTxns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                      <Wallet className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="font-medium text-gray-500">No transactions in {formatMonthYear(period.month, period.year)}</p>
                      <p className="text-sm mt-1">
                        {accounts.length === 0
                          ? 'Start by adding a custody account (e.g. "InstaPay float", "Vehicles").'
                          : 'Record top-ups and expenses with the buttons above.'}
                      </p>
                    </td>
                  </tr>
                ) : monthTxns.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-gray-600 text-xs">{t.txn_date}</td>
                    <td className="px-4 py-2.5 text-gray-700">{t.account?.name ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">{t.payee ?? '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500 max-w-xs truncate">{t.description ?? '—'}</td>
                    <td className={`px-4 py-2.5 text-right font-mono font-medium ${t.type === 'top_up' ? 'text-green-700' : 'text-red-600'}`}>
                      {t.type === 'top_up' ? '+' : '−'}{formatCurrency(t.amount)}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <button onClick={() => setDeleteTarget(t)} aria-label="Delete transaction"
                        className="text-gray-400 hover:text-red-600 p-1 rounded">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add account */}
      <Modal open={accountOpen} onClose={() => setAccountOpen(false)} title="Add Custody Account — عهدة جديدة" size="sm">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
            <input type="text" value={accountName} onChange={e => setAccountName(e.target.value)}
              placeholder="e.g. InstaPay float / Vehicles" className={`w-full ${inputCls}`} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Held by</label>
            <input type="text" value={accountHolder} onChange={e => setAccountHolder(e.target.value)}
              placeholder="Person responsible" className={`w-full ${inputCls}`} />
          </div>
          {accountError && <p className="text-sm text-red-600">{accountError}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setAccountOpen(false)}>Cancel</Button>
            <Button onClick={handleAddAccount} loading={accountSaving}>Add Account</Button>
          </div>
        </div>
      </Modal>

      {/* Add transaction */}
      <Modal open={txnOpen} onClose={() => setTxnOpen(false)}
        title={txnType === 'top_up' ? 'Record Top-up — إيداع' : 'Record Expense — مصروف'} size="md">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account *</label>
              <select value={txnAccount} onChange={e => setTxnAccount(e.target.value)} className={`w-full ${inputCls}`}>
                <option value="">Select account…</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Date</label>
              <input type="date" value={txnDate} onChange={e => setTxnDate(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Amount (EGP) *</label>
              <input type="number" min="0" value={txnAmount} onChange={e => setTxnAmount(e.target.value)} className={`w-full ${inputCls}`} />
            </div>
            {txnType === 'expense' && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payee (contractor / driver / landlord…)</label>
                <input type="text" value={txnPayee} onChange={e => setTxnPayee(e.target.value)} className={`w-full ${inputCls}`} />
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
            <input type="text" value={txnDescription} onChange={e => setTxnDescription(e.target.value)}
              placeholder={txnType === 'expense' ? 'e.g. vehicle maintenance, fuel, emergency purchase' : 'e.g. monthly float top-up'}
              className={`w-full ${inputCls}`} />
          </div>
          {txnError && <p className="text-sm text-red-600">{txnError}</p>}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <Button variant="outline" onClick={() => setTxnOpen(false)}>Cancel</Button>
            <Button onClick={handleAddTxn} loading={txnSaving}>
              {txnType === 'top_up' ? 'Record Top-up' : 'Record Expense'}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this transaction?"
        message={deleteTarget ? `${deleteTarget.type === 'top_up' ? 'Top-up' : 'Expense'} of ${formatCurrency(deleteTarget.amount)} EGP on ${deleteTarget.txn_date} will be permanently removed and the account balance will change.` : ''}
        loading={deleting}
        onConfirm={handleDelete}
        onClose={() => setDeleteTarget(null)}
      />
    </>
  )
}
