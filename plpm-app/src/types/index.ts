export type UserRole = 'admin' | 'finance'
export type Status = 'draft' | 'submitted' | 'approved' | 'rejected'
export type ServiceType = 'hk' | 'ls' | 'fm' | 'other'
export type EntityType = 'payroll' | 'expense'
export type ApprovalAction = 'created' | 'submitted' | 'approved' | 'rejected' | 'reset_to_draft'
export type ExpenseCategory = 'maintenance' | 'materials' | 'glass_facade' | 'spider' | 'phone' | 'utilities' | 'other'

export interface UserProfile {
  id: string
  full_name: string
  role: UserRole
  created_at: string
}

export interface Site {
  id: string
  name: string
  name_ar: string | null
  service_type: ServiceType
  client_name: string | null
  active: boolean
  sort_order: number
  created_at: string
}

export interface Employee {
  id: string
  site_id: string
  worker_number: number
  name: string
  base_monthly_salary: number
  daily_wage: number
  insurance_enrolled: boolean
  active: boolean
  created_at: string
  site?: Site
}

export interface PayrollPeriod {
  id: string
  site_id: string
  month: number
  year: number
  status: Status
  submitted_by: string | null
  approved_by: string | null
  submitted_at: string | null
  approved_at: string | null
  rejection_notes: string | null
  total_gross: number
  total_net: number
  created_at: string
  site?: Site
  submitted_by_profile?: UserProfile
  approved_by_profile?: UserProfile
}

export interface PayrollRecord {
  id: string
  period_id: string
  employee_id: string | null
  site_id: string
  worker_number: number | null
  employee_name: string
  attendance_days: number
  absence_days: number
  net_days: number
  monthly_leave_days: number
  annual_leave_days: number
  absence_no_permission: number
  overtime_hours: number
  less_hours: number
  base_monthly_salary: number
  daily_wage: number
  bonuses: number
  transportation_amount: number
  transportation_category: number
  advance: number
  deductions: number
  insurance: number
  penalties: number
  holiday_extra_days: number
  total_gross: number
  net_salary: number
  notes: string | null
  created_at: string
}

export interface ExpenseReport {
  id: string
  site_id: string
  month: number
  year: number
  status: Status
  submitted_by: string | null
  approved_by: string | null
  submitted_at: string | null
  approved_at: string | null
  rejection_notes: string | null
  total_transportation: number
  total_accommodation: number
  total_other: number
  grand_total: number
  created_at: string
  site?: Site
  submitted_by_profile?: UserProfile
  approved_by_profile?: UserProfile
}

export interface ExpenseTransportation {
  id: string
  report_id: string
  vehicle_name: string
  daily_cost: number
  days_count: number
  total: number
  sort_order: number
}

export interface ExpenseAccommodation {
  id: string
  report_id: string
  apartment_name: string
  rent_amount: number
  sort_order: number
}

export interface ExpenseItem {
  id: string
  report_id: string
  category: ExpenseCategory
  description: string
  amount: number
  sort_order: number
}

export type InvoiceStatus = 'draft' | 'agreed' | 'sent_to_accountant' | 'issued' | 'sent_to_client' | 'collected'
export type CollectionMethod = 'transfer' | 'cheque' | 'cash'
export type DeductionReason = 'headcount_shortfall' | 'evaluation' | 'conduct' | 'damages' | 'other'

export interface Client {
  id: string
  name: string
  name_ar: string | null
  active: boolean
  notes: string | null
  created_at: string
}

export interface Contract {
  id: string
  client_id: string
  name: string
  monthly_value: number
  payment_terms_days: number
  escalation_percent: number | null
  escalation_month: number | null
  start_date: string | null
  end_date: string | null
  active: boolean
  notes: string | null
  created_at: string
  client?: Client
  contract_sites?: { site_id: string; site?: Site }[]
}

export interface Invoice {
  id: string
  contract_id: string
  month: number
  year: number
  is_extra_works: boolean
  gross_amount: number
  total_deductions: number
  net_amount: number
  withholding_amount: number
  credit_note_amount: number
  credit_note_reason: string | null
  status: InvoiceStatus
  eta_reference: string | null
  issue_date: string | null
  due_date: string | null
  collected_date: string | null
  collection_method: CollectionMethod | null
  notes: string | null
  created_at: string
  contract?: Contract
}

export interface InvoiceDeduction {
  id: string
  invoice_id: string
  reason: DeductionReason
  description: string | null
  amount: number
  sort_order: number
}

export type AdvanceType = 'holiday' | 'long_term'
export type AdvanceStatus = 'active' | 'settled' | 'cancelled'
export type RepaymentSource = 'payroll' | 'cash'
export type CustodyTxnType = 'top_up' | 'expense'

export interface WorkerAdvance {
  id: string
  employee_id: string
  advance_type: AdvanceType
  amount: number
  monthly_installment: number
  advance_date: string
  status: AdvanceStatus
  notes: string | null
  created_at: string
  employee?: Employee
  repayments?: AdvanceRepayment[]
}

export interface AdvanceRepayment {
  id: string
  advance_id: string
  payroll_period_id: string | null
  month: number
  year: number
  amount: number
  source: RepaymentSource
  notes: string | null
  created_at: string
}

export interface CustodyAccount {
  id: string
  name: string
  name_ar: string | null
  holder: string | null
  active: boolean
  notes: string | null
  created_at: string
}

export interface CustodyTransaction {
  id: string
  account_id: string
  txn_date: string
  type: CustodyTxnType
  amount: number
  payee: string | null
  description: string | null
  created_at: string
  account?: CustodyAccount
}

export interface SiteBudget {
  id: string
  site_id: string
  month: number
  year: number
  planned_headcount: number
  budget_payroll: number
  budget_expenses: number
  notes: string | null
  created_at: string
  site?: Site
}

export interface ApprovalLog {
  id: string
  entity_type: EntityType
  entity_id: string
  action: ApprovalAction
  performed_by: string | null
  performed_at: string
  notes: string | null
  profile?: UserProfile
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

export const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
]

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  hk: 'Housekeeping',
  ls: 'Landscaping',
  fm: 'Facility Mgmt',
  other: 'Other',
}

export const STATUS_LABELS: Record<Status, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  approved: 'Approved',
  rejected: 'Rejected',
}

export const STATUS_COLORS: Record<Status, string> = {
  draft: 'bg-gray-100 text-gray-700',
  submitted: 'bg-blue-100 text-blue-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

// Mirrors the real cycle: Excel draft → deductions agreed in the monthly
// client meeting → sent to the external accountant → issued on the ETA
// portal → PDF emailed to the client → collected (always in full).
export const INVOICE_STATUS_FLOW: InvoiceStatus[] = [
  'draft', 'agreed', 'sent_to_accountant', 'issued', 'sent_to_client', 'collected',
]

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  agreed: 'Agreed with client',
  sent_to_accountant: 'Sent to accountant',
  issued: 'Issued on ETA',
  sent_to_client: 'Sent to client',
  collected: 'Collected',
}

export const INVOICE_STATUS_LABELS_AR: Record<InvoiceStatus, string> = {
  draft: 'مسودة',
  agreed: 'متفق عليها مع العميل',
  sent_to_accountant: 'أُرسلت للمحاسب',
  issued: 'صدرت على المنظومة',
  sent_to_client: 'أُرسلت للعميل',
  collected: 'تم التحصيل',
}

export const DEDUCTION_REASON_LABELS: Record<DeductionReason, string> = {
  headcount_shortfall: 'Headcount shortfall — نقص أعداد',
  evaluation: 'Performance evaluation — تقييم',
  conduct: 'Conduct violation — سلوك',
  damages: 'Damages — تلفيات',
  other: 'Other — أخرى',
}

export const COLLECTION_METHOD_LABELS: Record<CollectionMethod, string> = {
  transfer: 'Bank transfer',
  cheque: 'Cheque',
  cash: 'Cash',
}

export const ADVANCE_TYPE_LABELS: Record<AdvanceType, string> = {
  holiday: 'Holiday — سلفة عيد',
  long_term: 'Long-term — طويلة الأجل',
}

export const ADVANCE_STATUS_LABELS: Record<AdvanceStatus, string> = {
  active: 'Active',
  settled: 'Settled',
  cancelled: 'Cancelled',
}

export const CUSTODY_TXN_LABELS: Record<CustodyTxnType, string> = {
  top_up: 'Top-up — إيداع',
  expense: 'Expense — مصروف',
}
