-- Add holiday_extra_days to payroll_records.
--
-- The payroll workbooks carry one or more "extra" day columns per sheet
-- (اضافى / اضافي عيد / عيد عمال / اضافى عيد ورسمى) representing holiday and
-- festival extra days. These are distinct from overtime *hours*
-- (ساعات اضافى -> overtime_hours). The existing schema had no column for
-- them, so they are consolidated here into a single numeric field.

ALTER TABLE public.payroll_records
  ADD COLUMN IF NOT EXISTS holiday_extra_days numeric NOT NULL DEFAULT 0;
