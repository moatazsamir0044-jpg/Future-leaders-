# Production readiness

State of the PLPM platform after the August 2026 review. Everything in
**Fixed** is done and covered by a test. Everything in **Outstanding** is a real
gap with an owner-decision attached — none of it is speculative polish.

---

## Fixed in this pass

### Authorization was advisory

Every authorization rule lived in React. The browser holds the Supabase anon key
and can call PostgREST directly, so none of it was enforced. Two exploits were
confirmed against the live project (inside rolled-back transactions, no data
changed):

| | Before | Now |
|---|---|---|
| A `finance` user setting their own role to `admin` | One PATCH, succeeded | Refused by RLS |
| A non-admin approving payroll and rewriting its totals | One PATCH, succeeded | Refused by trigger |
| Editing an approved sheet's line items | Allowed | Refused until an admin reopens it |
| Claiming someone else approved a sheet | Client set `approved_by` | Stamped from the session |
| `draft` straight to `approved` | Allowed | Refused |
| Rewriting the audit log | Allowed | Append-only |

### The database could not be rebuilt

The core tables and all 44 sites were created by hand and never captured in a
migration. Applying `supabase/migrations` to an empty database failed on a
foreign key. Three separate causes, all fixed; the chain now builds from nothing
and CI proves it on every push.

### Silent wrong numbers

- Sheet and report totals were maintained in the browser read-modify-write.
  Two people editing one sheet overwrote each other's totals. Totals are now
  derived by trigger and clients cannot set them.
- Failed queries returned `{ data: null }`, and every page used `data ?? []`, so
  a broken query rendered as a month of zeros — indistinguishable from a month
  with no data. Failures now surface in the error boundary.
- `Math.round(x * 100) / 100` rounds an exact half *down* (1.005 × 100 is
  100.49999999999999), losing a piastre on every such amount.
- Manually added payroll rows carried no `employee_id`, so the advance ledger
  could never match a row to a worker: approving a sheet recorded no repayments
  at all. The feature was inert.
- `approval_logs`' CHECK constraint rejected `reset_to_draft`, the exact value
  the app writes, and the insert error was unchecked — every reopen was missing
  from the audit trail.
- Replacing an invoice's deductions was a delete followed by an insert. A
  failure between them left the invoice with no deduction rows but a stale
  `total_deductions`, overstating what the client owed. It is one transaction now.

### Other

- Arabic in PDF exports rendered as mojibake (jsPDF's built-in fonts have no
  Arabic glyphs) — on the sheet workers sign. An embedded subset font fixes it.
- Hard-coded Supabase URL and anon key replaced with required environment
  variables, so staging and production can differ and the key can be rotated.
- Settings was reachable by non-admins, where every control failed on save.
- Next.js upgraded for a proxy-bypass and two SSRF advisories: high-severity
  `npm audit` findings went from 6 to 0.

### Now in place

- **62 unit tests** over the payroll formula, advance ledger, approval
  transitions, period resolution, and the PDF export.
- **24 SQL assertions** that build a database from the migrations and prove the
  policies refuse what the UI hides — including both exploits above.
- **CI** running lint, typecheck, tests, build, `npm audit`, and the database
  suite on every push.

---

## Outstanding

### 1. The migrations are not applied to production

The fixes above exist as migration files. They have **not** been applied to the
live project — that was left as your call. Until they run, both exploits remain
open on the deployed system.

```bash
supabase migration repair --status applied 20260629000000   # baseline is already there
supabase db push
```

Apply to a branch or a restored snapshot first. The behaviour changes are real:
approved sheets become read-only, non-admins lose the approve button's effect,
and totals stop accepting client values.

### 2. Vercel needs the Supabase variables before the next deploy

Removing the hard-coded URL and anon key means the Vercel project must now
supply them. It never has, so the build stops:

```
Error: Failed to collect configuration for /api/admin/users
  [cause]: Error: NEXT_PUBLIC_SUPABASE_URL is not set.
```

That is the guard doing its job — better a failed build than a deployment
pointing at nothing — but **production cannot deploy until they are set**. Add
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under the Vercel
project's environment variables for Production, Preview and Development, then
rebuild. `NEXT_PUBLIC_*` is inlined at build time, so setting them without a
rebuild changes nothing.

`SUPABASE_SERVICE_ROLE_KEY` is optional and server-only; without it, inviting
users returns a clear error and the rest of the app works.

### 3. The employee roster is empty

`employees` has **0 rows** against 6,051 payroll records. Everything keyed off
the roster is therefore inert: new-sheet prefill, advance ledger matching, and
the morning report's headcount-vs-plan shortfall — its central number. The
payroll records carry names but no `employee_id`, so they cannot be back-linked
automatically without a matching pass on name and site.

Decide whether the roster is going to be maintained. If yes, it needs an import
and a rule for who keeps it current. If no, the advance ledger and morning
report should be removed rather than left showing zeros.

### 4. No backup or recovery plan

Nothing in the repository or the project settings documents backup frequency,
retention, or a tested restore. This is payroll data for ~1,700 workers. Supabase's
automatic backups depend on your plan; confirm what you actually have, and
rehearse a restore before you need one.

### 5. No error tracking

No Sentry, no structured logging, no alerting. A server-side failure now reaches
the user as an error boundary, which is an improvement, but nobody is told. You
will find out about breakage when someone mentions it.

### 6. Unbounded queries

45 list queries have no `limit` or pagination. `/dashboard/advances`,
`/dashboard/custody` and `/dashboard/employees` load every row ever created.
Fine at today's volumes, a cliff as history accumulates — the advances page in
particular grows forever because settled advances are never archived.

### 7. `/api/admin/users` has no rate limit

It is admin-gated, but an authenticated admin can drive unlimited invitation
emails through it. Supabase's own limits are the only backstop.

### 8. Only approvals are audited

`approval_logs` records status transitions. Nothing records who changed a
worker's salary, edited a payroll figure, or deleted a line — the changes that
actually move money. Consider row-level history on `payroll_records` and
`employees`.

### 9. Two roles for a wider org

`admin` and `finance` are the only roles, and `finance` can read and write every
site's data. There is no site-scoped access, so a site supervisor cannot be
given their own sheet without seeing all 44. Fine for a small finance team;
a blocker if this reaches site level.

### 10. Smaller items

- **Leaked-password protection is off** in Supabase Auth. One toggle; turn it on.
- **Two dead functions**, `is_admin()` and `current_role_name()`, query a
  `public.profiles` table that does not exist. Left over from another project —
  they error if ever called. Drop them.
- **Two moderate advisories remain** (`uuid` via `exceljs`), fixable only by a
  breaking downgrade to exceljs 3.x. The affected code path (v3/v5/v6 UUIDs with
  a caller-supplied buffer) is not one this app reaches. Accepted, not ignored.
- **No E2E tests.** Unit and database layers are covered; nothing exercises a
  real browser through login → edit → submit → approve.
- **No accessibility audit.** Keyboard and screen-reader behaviour is unverified.
- **Bilingual strings are hardcoded** in both English and Arabic across
  components, with no i18n layer. Adding a language means editing every file.

---

## Verdict

The system is **sound to deploy once the migrations are applied** (item 1) and
the Vercel variables are set (item 2). Item 3, the empty roster, is the
difference between a working system and one that is quietly wrong in two of its
screens.

Items 4 and 5 — backups and error tracking — are what separates "it runs" from
"you can operate it". They are not code changes and should be settled before
this carries a month of real payroll on its own.

The rest is scaling and hardening work that can follow real usage.
