# PLPM — Professional Leaders operations platform

Internal system for a facility-management contractor in Egypt: monthly payroll
sheets per site, site expense reports, client invoicing and receivables, a
worker advance ledger, cash custody (العهدة), and the monthly handoff pack for
the external accountant.

Next.js 16 (App Router) with Supabase for auth and Postgres.

## Running locally

```bash
cp .env.example .env.local     # fill in from Supabase → Project Settings → API
npm install
npm run dev                    # http://localhost:3000
```

`NEXT_PUBLIC_*` variables are inlined into the bundle at build time, not read
at runtime. They must be set **before** `next build` — in Vercel that means
project environment variables, not runtime config. The build fails with a named
error if either is missing, so a deployment can't silently come up pointing at
nothing.

`SUPABASE_SERVICE_ROLE_KEY` is server-only and optional. It is used by
`/api/admin/users` to send account invitations; without it that one feature
returns a clear error and everything else works.

## Checks

```bash
npm run lint
npm run typecheck
npm test           # unit tests (vitest)
npm run test:db    # migrations + RLS policy tests, needs a local PostgreSQL
npm run build
```

`npm run test:db` builds a throwaway database from `supabase/migrations` and
asserts the authorization rules hold. It needs a PostgreSQL you can create
databases on; it honours the usual `PG*` environment variables.

CI runs all of the above on every push (`.github/workflows/ci.yml`).

## Where the rules live

**Authorization is enforced in the database, not in React.** The browser holds
the Supabase anon key and can call PostgREST directly, so any check that exists
only in a component is advisory. Row-Level Security policies and triggers in
`supabase/migrations/20260828000001_harden_authorization_and_totals.sql` are
what actually hold:

- Only admins can change a user's role, and the last admin can't be demoted.
- Only admins can approve, reject, or undo an approval, and status can't skip a
  step (a draft can't jump straight to approved). Reopening a *rejected* record
  is not admin-gated — that is its author acting on the correction they were
  asked for.
- `submitted_by` / `approved_by` are stamped from the session server-side, so a
  client can't claim someone else approved a sheet.
- Submitted and approved sheets are frozen — their line items can't be edited,
  added to, or deleted until an admin reopens them.
- Sheet and report totals are derived by trigger from their line rows. Clients
  cannot set them; a PATCH naming those columns is ignored.
- `approval_logs` is append-only.

`src/lib/approvals.ts` mirrors the transition table so the UI can fail with a
readable message, and a unit test asserts the two stay in step. If you change
one, change both.

## Database

Migrations in `supabase/migrations` build the schema from nothing, in order.
`20260629000000_baseline_schema.sql` is the baseline; the hosted project
predates it, so mark it applied there rather than running it:

```bash
supabase migration repair --status applied 20260629000000
```

`supabase/tests/_supabase_shim.sql` stands in for the Supabase-provided pieces
(`auth` schema, `auth.uid()`, roles) so the migrations can run on plain
PostgreSQL in CI. It is never applied to a real Supabase project.

## Exports

Excel exports (ExcelJS) are the primary format — they mirror the source
spreadsheets and are what the accounting office receives. PDF exports embed a
subset of Noto Naskh Arabic; jsPDF's built-in fonts have no Arabic glyphs, so
without it every worker name rendered as mojibake. The font is dynamically
imported, so only someone exporting a PDF downloads it.

## Known gaps

See `docs/production-readiness.md`.
