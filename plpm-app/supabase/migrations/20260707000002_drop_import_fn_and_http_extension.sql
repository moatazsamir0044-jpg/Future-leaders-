-- Security cleanup.
--
-- _import_payroll was a one-off bulk-import helper (20260629130926) declared
-- SECURITY DEFINER and granted to anon: anyone holding the public anon key
-- could insert arbitrary sites/employees/payroll rows. The import is long
-- done; remove it.
--
-- The http extension was enabled briefly on 2026-07-07 to re-apply the May
-- 2026 payroll migration from the repository; it is no longer needed.

DROP FUNCTION IF EXISTS public._import_payroll(jsonb);
DROP EXTENSION IF EXISTS http;
