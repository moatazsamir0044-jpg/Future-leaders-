# PLPM App — Complete Context Document

> Copy this entire document into Perplexity when asking for help with fixes.

---

## 1. What Is This App?

**PLPM** (Professional Leaders — Payroll & Labor Management) is an internal operations platform for **Professional Leaders**, an Egyptian facility management company. It manages monthly payroll sheets and expense reports across multiple work sites, with a two-role approval workflow.

- **Frontend**: Next.js 16.2.9 (App Router, React 19, TypeScript, Tailwind CSS v4)
- **Backend / DB**: Supabase (PostgreSQL, Row-Level Security, Auth)
- **Exports**: ExcelJS (xlsx), jsPDF (PDF)
- **Deployment**: Vercel
- **Currency**: Egyptian Pounds (EGP)
- **Language**: UI is English; employee names and Excel exports are in Arabic (RTL)

---

## 2. File & Folder Structure

```
plpm-app/
├── src/
│   ├── app/
│   │   ├── page.tsx                          # Redirects to /dashboard
│   │   ├── layout.tsx                        # Root layout (Geist font)
│   │   ├── globals.css
│   │   ├── login/page.tsx                    # Email/password login
│   │   └── dashboard/
│   │       ├── layout.tsx                    # Auth guard + Sidebar wrapper
│   │       ├── page.tsx                      # Dashboard home (KPIs + charts)
│   │       ├── payroll/
│   │       │   ├── page.tsx                  # Payroll list (filtered by month/year)
│   │       │   └── [id]/page.tsx             # Payroll detail (records table + actions)
│   │       ├── expenses/
│   │       │   ├── page.tsx                  # Expense report list
│   │       │   └── [id]/page.tsx             # Expense detail (3 sub-tables + actions)
│   │       ├── employees/page.tsx            # Employee CRUD
│   │       ├── approvals/page.tsx            # Approval queue (submitted/approved/rejected)
│   │       └── settings/page.tsx             # Site manager + User manager
│   ├── components/
│   │   ├── layout/sidebar.tsx                # Fixed left nav (slate-900 bg)
│   │   ├── ui/
│   │   │   ├── button.tsx                    # Button (variants: default/outline/danger)
│   │   │   ├── modal.tsx                     # Dialog overlay
│   │   │   ├── badge.tsx                     # StatusBadge (draft/submitted/approved/rejected)
│   │   │   ├── input.tsx
│   │   │   ├── card.tsx
│   │   │   └── select.tsx
│   │   ├── payroll/
│   │   │   ├── payroll-table.tsx             # Inline-edit employee records table (client)
│   │   │   ├── payroll-actions.tsx           # Submit/Approve/Reject/Export buttons (client)
│   │   │   └── new-payroll-button.tsx        # Create new payroll period modal (client)
│   │   ├── expenses/
│   │   │   ├── expense-tables.tsx            # Transportation + Accommodation + Items tables (client)
│   │   │   ├── expense-actions.tsx           # Submit/Approve/Reject/Export buttons (client)
│   │   │   └── new-expense-button.tsx        # Create new expense report modal (client)
│   │   ├── employees/employee-manager.tsx    # Employee CRUD table (client)
│   │   ├── settings/
│   │   │   ├── site-manager.tsx              # Site CRUD (client)
│   │   │   └── user-manager.tsx              # User profile CRUD (client)
│   │   └── dashboard/
│   │       ├── charts.tsx                    # Recharts bar charts (client)
│   │       └── filters.tsx                   # Month/year/site filter controls (client)
│   ├── lib/
│   │   ├── supabase/
│   │   │   ├── config.ts                     # SUPABASE_URL + SUPABASE_ANON_KEY (falls back to hardcoded)
│   │   │   ├── server.ts                     # createClient() for Server Components (cookies)
│   │   │   └── client.ts                     # createClient() for Client Components (browser)
│   │   ├── export/
│   │   │   ├── excel.ts                      # exportPayrollToExcel / exportExpenseToExcel
│   │   │   └── pdf.ts                        # exportPayrollToPDF / exportExpenseToPDF
│   │   └── utils.ts                          # cn(), formatCurrency(), formatMonthYear()
│   └── types/index.ts                        # All shared TypeScript types + constants
└── supabase/migrations/
    ├── 20260629000002_import_may_2026_payroll.sql
    └── 20260629000003_fix_user_profiles_rls_recursion.sql
```

---

## 3. Database Schema (Supabase / PostgreSQL)

### `user_profiles`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | Same as `auth.users.id` |
| full_name | text | |
| role | text | `'admin'` or `'finance'` |
| created_at | timestamptz | |

### `sites`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | English name |
| name_ar | text nullable | Arabic name (used in Excel exports) |
| service_type | text | `'hk'` (Housekeeping), `'ls'` (Landscaping), `'fm'` (Facility Mgmt), `'other'` |
| client_name | text nullable | |
| active | boolean | Filter: only active sites shown in most queries |
| sort_order | int | Controls display order |
| created_at | timestamptz | |

### `employees`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| site_id | uuid (FK → sites) | |
| worker_number | int | |
| name | text | Arabic name |
| base_monthly_salary | numeric | |
| daily_wage | numeric | |
| insurance_enrolled | boolean | |
| active | boolean | |
| created_at | timestamptz | |

### `payroll_periods`
One row per site per month/year. The "header" of a payroll sheet.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| site_id | uuid (FK → sites) | |
| month | int | 1–12 |
| year | int | |
| status | text | `draft` → `submitted` → `approved`/`rejected` |
| submitted_by | uuid nullable (FK → user_profiles) | |
| approved_by | uuid nullable | |
| submitted_at | timestamptz nullable | |
| approved_at | timestamptz nullable | |
| rejection_notes | text nullable | |
| total_gross | numeric | Auto-recalculated on record save/delete |
| total_net | numeric | Auto-recalculated on record save/delete |
| created_at | timestamptz | |

### `payroll_records`
One row per employee per payroll_period.

| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| period_id | uuid (FK → payroll_periods) | |
| employee_id | uuid nullable (FK → employees) | |
| site_id | uuid (FK → sites) | |
| worker_number | int nullable | |
| employee_name | text | Arabic name |
| attendance_days | numeric | |
| absence_days | numeric | |
| net_days | numeric | |
| monthly_leave_days | numeric | |
| annual_leave_days | numeric | |
| absence_no_permission | numeric | |
| overtime_hours | numeric | |
| less_hours | numeric | |
| base_monthly_salary | numeric | |
| daily_wage | numeric | |
| bonuses | numeric | |
| transportation_amount | numeric | |
| transportation_category | numeric | |
| advance | numeric | سلف |
| deductions | numeric | |
| insurance | numeric | |
| penalties | numeric | |
| holiday_extra_days | numeric | |
| total_gross | numeric | |
| net_salary | numeric | |
| notes | text nullable | |
| created_at | timestamptz | |

### `expense_reports`
Header row for one site's expense report for a month.

| Column | Type |
|---|---|
| id | uuid (PK) |
| site_id | uuid (FK → sites) |
| month | int |
| year | int |
| status | text (same workflow as payroll) |
| submitted_by | uuid nullable |
| approved_by | uuid nullable |
| submitted_at | timestamptz nullable |
| approved_at | timestamptz nullable |
| rejection_notes | text nullable |
| total_transportation | numeric |
| total_accommodation | numeric |
| total_other | numeric |
| grand_total | numeric |
| created_at | timestamptz |

### `expense_transportation`
| Column | Type |
|---|---|
| id | uuid (PK) |
| report_id | uuid (FK → expense_reports) |
| vehicle_name | text |
| daily_cost | numeric |
| days_count | numeric |
| total | numeric (daily_cost × days_count) |
| sort_order | int |

### `expense_accommodation`
| Column | Type |
|---|---|
| id | uuid (PK) |
| report_id | uuid (FK → expense_reports) |
| apartment_name | text |
| rent_amount | numeric |
| sort_order | int |

### `expense_items`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| report_id | uuid (FK → expense_reports) | |
| category | text | `maintenance`, `materials`, `glass_facade`, `spider`, `phone`, `utilities`, `other` |
| description | text | |
| amount | numeric | |
| sort_order | int | |

### `approval_logs`
| Column | Type | Notes |
|---|---|---|
| id | uuid (PK) | |
| entity_type | text | `'payroll'` or `'expense'` |
| entity_id | uuid | References payroll_periods or expense_reports |
| action | text | `created`, `submitted`, `approved`, `rejected`, `reset_to_draft` |
| performed_by | uuid nullable (FK → user_profiles) | |
| performed_at | timestamptz | |
| notes | text nullable | |

---

## 4. Authentication & Authorization

- Supabase email/password auth (`supabase.auth.signInWithPassword`)
- On login success → redirect to `/dashboard`
- `dashboard/layout.tsx` (Server Component) calls `supabase.auth.getUser()` — unauthenticated users are redirected to `/login`
- Each detail page also fetches the current user's `user_profiles` row to determine their **role**

### Roles
| Role | Can Do |
|---|---|
| `finance` | Create/edit payroll and expense records (when status is `draft` or `rejected`), submit for approval |
| `admin` | Everything finance can do + approve/reject submitted records, reset approved/rejected back to draft, manage sites and users in Settings |

---

## 5. Approval Workflow

Both payroll periods and expense reports follow the same state machine:

```
draft  ──[submit]──►  submitted  ──[approve (admin)]──►  approved
                                 ──[reject (admin)]───►  rejected
                                                              │
approved ──[reset to draft (admin)]──────────────────────────┘
rejected ──[reset to draft (admin)]──────────────────────────┘
```

- Edit controls (add/delete employee rows or expense items) are only visible when status is `draft` or `rejected`
- The `PayrollActions` / `ExpenseActions` client components render different buttons based on `period.status` and the current user's `role`

---

## 6. Page-by-Page Summary

### `/login`
Email + password form. Calls `supabase.auth.signInWithPassword`. On success pushes to `/dashboard`.

### `/dashboard` (home)
Server Component. Accepts `?month=&year=&site=&status=` query params. Defaults to the latest month that has any payroll data. Fetches in parallel: sites, payroll_periods, expense_reports, pending counts. Shows:
- 4 KPI cards (Total Payroll, Total Expenses, Total Cost, Pending Approvals)
- Bar charts (Recharts) via `DashboardCharts`
- Two side-by-side summary tables (payroll + expenses for the selected month)

### `/dashboard/payroll`
Lists all `payroll_periods` for the selected month/year. Has a **"New Payroll"** button that opens a modal to pick a site (only sites that don't already have a period for this month/year) and creates a new `draft` period row.

### `/dashboard/payroll/[id]`
Shows a single payroll period. Header with site name, month, status badge. Summary cards. Then `PayrollTable` (client component) showing all `payroll_records` for this period. Actions (Excel/PDF export, Submit/Approve/Reject/Reset) via `PayrollActions`.

### `/dashboard/expenses`
Lists all `expense_reports` for the selected month/year. Has a **"New Expense"** button similar to payroll.

### `/dashboard/expenses/[id]`
Shows a single expense report. Three editable sub-tables: Transportation, Accommodation, Other Items. Actions for approval workflow and export.

### `/dashboard/employees`
CRUD table for employees. Each employee belongs to a site. Employee fields: worker number, name (Arabic), base monthly salary, daily wage, insurance enrolled, active status.

### `/dashboard/approvals`
Shows payroll_periods and expense_reports that are in `submitted`, `approved`, or `rejected` status for the selected month/year. Links directly to the detail pages for review.

### `/dashboard/settings`
Two sections:
1. **Sites** — CRUD for work sites (name, name_ar, service_type, client_name, active, sort_order)
2. **Users** — View and edit `user_profiles` (full_name, role). Cannot create auth users here; that's done directly in Supabase.

---

## 7. Key Client-Side Patterns

- All data mutations go directly to Supabase from the browser using the anon key (protected by RLS)
- After a mutation, `router.refresh()` is called inside `startTransition()` to re-fetch server-side data without a full page reload
- Modals are used for create/edit forms (`<Modal>` component wrapping a portal-style overlay)
- Totals (`total_gross`, `total_net` on `payroll_periods`; `total_transportation` etc. on `expense_reports`) are recalculated client-side after every record save/delete and written back to the parent row in a separate Supabase update call

---

## 8. Export

### Excel (ExcelJS)
- **Payroll**: Arabic RTL header with company name, site name, month. One row per employee with all salary fields. Totals row at bottom. Downloads as `Payroll_{site}_{month}_{year}.xlsx`
- **Expenses**: Sectioned by Transportation, Accommodation, Other Items. Downloads as `Expenses_{site}_{month}_{year}.xlsx`

### PDF (jsPDF + jspdf-autotable)
- Similar structure to Excel exports but rendered as PDF tables

---

## 9. RLS & Known Issues Fixed

### RLS Infinite Recursion (FIXED via migration `20260629000003`)
The original `user_profiles` RLS policies selected `FROM user_profiles` to check `role = 'admin'`, causing Postgres error `42P17` (infinite recursion). The `sites` table also had a policy querying `user_profiles`, so **any query joining `sites`** (including the dashboard's `payroll_periods?select=*,site:sites(...)`) returned HTTP 500.

**Fix**: A `SECURITY DEFINER` function `public.is_plpm_admin()` was created that bypasses RLS to check admin status. All affected policies now call this function instead of querying `user_profiles` directly.

```sql
create or replace function public.is_plpm_admin()
returns boolean language sql stable security definer set search_path to 'public'
as $$
  select exists (
    select 1 from public.user_profiles
    where id = auth.uid() and role = 'admin'
  );
$$;
```

---

## 10. Tech Stack Versions

| Package | Version |
|---|---|
| next | 16.2.9 |
| react | 19.2.4 |
| typescript | ^5 |
| tailwindcss | ^4 |
| @supabase/supabase-js | ^2.108.2 |
| @supabase/ssr | ^0.12.0 |
| exceljs | ^4.4.0 |
| jspdf | ^4.2.1 |
| jspdf-autotable | ^5.0.8 |
| recharts | ^3.9.0 |
| react-hook-form | ^7.80.0 |
| zod | ^4.4.3 |
| lucide-react | ^1.21.0 |
| date-fns | ^4.4.0 |

> **Note**: This is Next.js 16 (App Router). It has breaking changes from Next.js 13–15. `searchParams` in page components is now a `Promise<>` and must be `await`-ed. `params` in `[id]` routes is also a `Promise<>`.

---

## 11. TypeScript Types (src/types/index.ts)

```typescript
type UserRole = 'admin' | 'finance'
type Status = 'draft' | 'submitted' | 'approved' | 'rejected'
type ServiceType = 'hk' | 'ls' | 'fm' | 'other'
type EntityType = 'payroll' | 'expense'
type ApprovalAction = 'created' | 'submitted' | 'approved' | 'rejected' | 'reset_to_draft'
type ExpenseCategory = 'maintenance' | 'materials' | 'glass_facade' | 'spider' | 'phone' | 'utilities' | 'other'

interface UserProfile { id, full_name, role, created_at }
interface Site { id, name, name_ar, service_type, client_name, active, sort_order, created_at }
interface Employee { id, site_id, worker_number, name, base_monthly_salary, daily_wage, insurance_enrolled, active, created_at, site? }
interface PayrollPeriod { id, site_id, month, year, status, submitted_by, approved_by, submitted_at, approved_at, rejection_notes, total_gross, total_net, created_at, site?, submitted_by_profile?, approved_by_profile? }
interface PayrollRecord { id, period_id, employee_id, site_id, worker_number, employee_name, attendance_days, absence_days, net_days, monthly_leave_days, annual_leave_days, absence_no_permission, overtime_hours, less_hours, base_monthly_salary, daily_wage, bonuses, transportation_amount, transportation_category, advance, deductions, insurance, penalties, holiday_extra_days, total_gross, net_salary, notes, created_at }
interface ExpenseReport { id, site_id, month, year, status, submitted_by, approved_by, submitted_at, approved_at, rejection_notes, total_transportation, total_accommodation, total_other, grand_total, created_at, site?, submitted_by_profile?, approved_by_profile? }
interface ExpenseTransportation { id, report_id, vehicle_name, daily_cost, days_count, total, sort_order }
interface ExpenseAccommodation { id, report_id, apartment_name, rent_amount, sort_order }
interface ExpenseItem { id, report_id, category, description, amount, sort_order }
interface ApprovalLog { id, entity_type, entity_id, action, performed_by, performed_at, notes, profile? }
```
