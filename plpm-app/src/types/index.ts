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
