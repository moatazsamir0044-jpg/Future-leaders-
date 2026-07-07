-- Full separation from the old Birdnest tracker app, which shared this
-- Supabase project before PLPM was built. Rows were already cleared; this
-- drops the tables themselves so there's no leftover schema, FK, or RLS
-- coupling between the two apps. Nothing in the PLPM codebase or schema
-- references these (verified: no FKs from PLPM tables, no code references).

drop table if exists public.task_updates;
drop table if exists public.tasks;
drop table if exists public.profiles;
