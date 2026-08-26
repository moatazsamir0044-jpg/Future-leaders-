BEGIN;

-- ============================================================
-- Load one site's payroll sheet for one month, atomically.
--
-- The app reads the monthly workbook in the browser and calls this once per
-- worksheet. Doing the replace inside a function means a site's month is never
-- left half-written: the delete and the inserts either all happen or none do.
--
-- Re-running for the same site and month replaces that site's sheet, so a
-- corrected workbook can simply be imported again.
--
-- SECURITY INVOKER: the caller's own permissions apply, so this cannot be used
-- to reach past row-level security.
-- ============================================================

CREATE OR REPLACE FUNCTION import_site_payroll(
  p_site_id     UUID,
  p_month       INT,
  p_year        INT,
  p_status      TEXT,
  p_total_gross NUMERIC,
  p_total_net   NUMERIC,
  p_rows        JSONB
-- The output columns are deliberately not named period_id: inside the body that
-- would be ambiguous against payroll_records.period_id and the DELETE fails.
) RETURNS TABLE (created_period UUID, records_written INT)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_period UUID;
  v_count  INT;
BEGIN
  IF p_month NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'month must be 1-12, got %', p_month;
  END IF;
  IF p_year NOT BETWEEN 2000 AND 2100 THEN
    RAISE EXCEPTION 'year looks wrong: %', p_year;
  END IF;
  IF p_status NOT IN ('draft', 'submitted', 'approved') THEN
    RAISE EXCEPTION 'unexpected status %', p_status;
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'no rows supplied for this sheet';
  END IF;

  DELETE FROM payroll_records pr
   WHERE pr.period_id IN (SELECT id FROM payroll_periods
                           WHERE site_id = p_site_id AND month = p_month AND year = p_year);
  DELETE FROM payroll_periods
   WHERE site_id = p_site_id AND month = p_month AND year = p_year;

  INSERT INTO payroll_periods (site_id, month, year, status, total_gross, total_net)
  VALUES (p_site_id, p_month, p_year, p_status, p_total_gross, p_total_net)
  RETURNING id INTO v_period;

  INSERT INTO payroll_records (
    period_id, site_id, worker_number, employee_name, notes,
    net_salary, total_gross, bonuses, transportation_amount, transportation_category,
    advance, deductions, insurance, daily_wage, base_monthly_salary,
    net_days, absence_days, holiday_extra_days, penalties, less_hours,
    overtime_hours, absence_no_permission, annual_leave_days, monthly_leave_days,
    attendance_days)
  SELECT
    v_period, p_site_id,
    NULLIF(r->>'worker_number', '')::INT,
    r->>'employee_name',
    NULLIF(r->>'notes', ''),
    (r->>'net_salary')::NUMERIC,
    (r->>'total_gross')::NUMERIC,
    (r->>'bonuses')::NUMERIC,
    (r->>'transportation_amount')::NUMERIC,
    (r->>'transportation_category')::NUMERIC,
    (r->>'advance')::NUMERIC,
    (r->>'deductions')::NUMERIC,
    (r->>'insurance')::NUMERIC,
    (r->>'daily_wage')::NUMERIC,
    (r->>'base_monthly_salary')::NUMERIC,
    (r->>'net_days')::NUMERIC,
    (r->>'absence_days')::NUMERIC,
    (r->>'holiday_extra_days')::NUMERIC,
    (r->>'penalties')::NUMERIC,
    (r->>'less_hours')::NUMERIC,
    (r->>'overtime_hours')::NUMERIC,
    (r->>'absence_no_permission')::NUMERIC,
    (r->>'annual_leave_days')::NUMERIC,
    (r->>'monthly_leave_days')::NUMERIC,
    (r->>'attendance_days')::NUMERIC
  FROM jsonb_array_elements(p_rows) AS r;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count <> jsonb_array_length(p_rows) THEN
    RAISE EXCEPTION 'wrote % rows but the sheet had %', v_count, jsonb_array_length(p_rows);
  END IF;

  RETURN QUERY SELECT v_period, v_count;
END $$;

REVOKE ALL ON FUNCTION import_site_payroll(UUID, INT, INT, TEXT, NUMERIC, NUMERIC, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION import_site_payroll(UUID, INT, INT, TEXT, NUMERIC, NUMERIC, JSONB) TO authenticated;

COMMIT;
