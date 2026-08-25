BEGIN;

-- ============================================================
-- Remove the leftovers of the fabricated seed data.
--
-- Two things were left behind by the original generated import and were
-- still showing up in the app:
--
--   1. 20 sites that have never had a payroll sheet. They came from the
--      generated seed, not from the company's books, and were filling every
--      site dropdown and filter.
--   2. 1,726 invented employees. Not one of them was referenced by a real
--      payroll record (every payroll_records.employee_id is NULL), nor by an
--      advance, repayment, contract or budget - they were pure seed data,
--      and "New Payroll Sheet" was going to prefill from them.
--
-- Sites are deactivated rather than deleted, so nothing that might later
-- reference them is broken; the app already filters pickers on active = true.
-- ============================================================

UPDATE sites SET active = false
 WHERE active
   AND id NOT IN (SELECT DISTINCT site_id FROM payroll_periods);

DELETE FROM employees;

-- Verify, or roll the whole thing back.
DO $$
DECLARE v_active INT; v_emp INT; v_records INT; v_periods INT;
BEGIN
  SELECT count(*) INTO v_active  FROM sites WHERE active;
  SELECT count(*) INTO v_emp     FROM employees;
  SELECT count(*) INTO v_records FROM payroll_records;
  SELECT count(*) INTO v_periods FROM payroll_periods;

  IF v_active <> 24 THEN
    RAISE EXCEPTION 'expected 24 active sites, found %', v_active;
  END IF;
  IF v_emp <> 0 THEN
    RAISE EXCEPTION 'expected 0 employees, found %', v_emp;
  END IF;
  -- the payroll itself must be untouched by this cleanup
  IF v_records <> 6051 OR v_periods <> 70 THEN
    RAISE EXCEPTION 'payroll changed during cleanup: % records, % periods',
      v_records, v_periods;
  END IF;
  RAISE NOTICE 'cleanup ok: % active sites, % employees, % payroll records',
    v_active, v_emp, v_records;
END $$;

COMMIT;
