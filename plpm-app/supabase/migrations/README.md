# Supabase migrations

Apply in filename (timestamp) order. From `plpm-app/`:

```bash
supabase db push        # applies pending migrations
# or paste each file into the Supabase SQL editor in order
```

## Migrations

- `20260629000001_add_holiday_extra_days.sql` — adds
  `payroll_records.holiday_extra_days` (numeric). Consolidates the workbook's
  holiday/festival "extra day" columns (اضافى / اضافي عيد / عيد عمال), which
  are distinct from overtime *hours* (`overtime_hours`).

- `20260629000002_import_may_2026_payroll.sql` — imports the May 2026 payroll
  for the Tagamoa and October regions: **24 sites, 1726 employees, 24 draft
  payroll periods, 1940 payroll records**.

### Excel → schema mapping

Each workbook has one sheet per site plus a `Total` summary (skipped on import,
used only to validate). Per-sheet header row → `payroll_records` columns:

| Arabic header | Column |
|---|---|
| رقم العامل | `worker_number` |
| الاسم | `employee_name` |
| عدد ايام حضور | `attendance_days` |
| الغياب | `absence_days` |
| صافى الايام | `net_days` |
| اجازات شهرى | `monthly_leave_days` |
| اجازت سنوى / عيد | `annual_leave_days` |
| غياب بدون اذن | `absence_no_permission` |
| ساعات اضافى | `overtime_hours` |
| ساعات اقل | `less_hours` |
| الراتب الشهرى | `base_monthly_salary` |
| الاجر اليومى | `daily_wage` |
| مكافاءت | `bonuses` |
| مواصلات | `transportation_amount` |
| فئة المواصلات | `transportation_category` |
| سلف | `advance` |
| استقطاعات | `deductions` |
| تامينات | `insurance` |
| جزاءات / خصم | `penalties` |
| اضافى / اضافي عيد | `holiday_extra_days` |
| الاجمالى | `total_gross` |
| صافى الراتب | `net_salary` |

Notes:
- **Sites** are granular: one row per non-empty sheet (e.g. Mall of Egypt - HK,
  - LS, Magic, Cinema, Ski, Offices are separate sites), `client_name` set to
  the source region. Pre-existing broad-region sites are left untouched.
- **Employees** are derived as one row per (site, worker_number) with
  `insurance_enrolled = (insurance > 0)`. Records also link `employee_id`.
- Empty sheets (`MOA. LS`, `Asema`) and summary sheets (`Total`, `مقارنه`) are
  skipped. Repeated print-headers and "اجماليات" total rows are filtered out.
- Most periods are month 5 (May); `Mazar` is March and `Arkan LS` is February,
  as labelled in their sheet headers.
