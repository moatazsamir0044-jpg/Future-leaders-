# Payroll Excel import

Loads the monthly workbook — one tab per site — into the system, replacing the
manual re-entry of every site sheet.

## The rule that shapes everything else

**The importer never computes anybody's pay.** Every figure is stored exactly
as the site's sheet has it.

This is not caution for its own sake. Checking the app's salary formula
(`net_days × daily_wage + holiday × daily_wage + overtime × daily_wage/8 −
less_hours × daily_wage/8 + bonuses + transport`) against the 6,051 rows
already in production:

| | rows | matches the app formula |
|---|---|---|
| May 2026 | 1,946 | 241 |
| June 2026 | 2,033 | 810 |
| July 2026 | 2,072 | 388 |

76% of live rows do not follow it, and no single alternative formula fits
either — the sites reach their figures in ways that differ by site and by
month. An importer that recalculated gross would therefore have rewritten
three quarters of the payroll. So it doesn't: it reads what the sheet says and
checks that reading against the sheet's own totals.

## What happens to a file

1. **Parse** (in the browser — the file is never uploaded anywhere).
   Each tab is scanned row by row and every row classified as a header, a
   section heading, a worker, a totals row, or noise. Headers may repeat: real
   sheets restart them for every section (`مواصلات صباحى`, `SPV. Morning&Night`,
   `الفيوم 1` …), and the section heading is stored on each row as `notes`,
   matching how the existing production rows carry it.

2. **Check.** A sheet is refused outright — no import possible until the file
   is fixed — when any of these hold:
   - the row totals disagree with a totals row the sheet computed itself
     (tolerance: one piastre, which is reported rather than hidden);
   - a formula cell has no saved result (the file was never recalculated);
   - a cell holds an Excel error (`#REF!`, `#DIV/0!`);
   - a numeric column holds text that is not a number — never silently zeroed;
   - a required column (name, gross, net) is missing;
   - a row carries figures but no employee name.

   Softer findings are reported but do not block: net not equalling gross minus
   deductions, negative net, all-zero rows, repeated names within a section,
   unrecognised columns, columns absent and therefore stored as 0, and sheets
   with no totals row to cross-check against.

3. **Review.** Every tab is listed with its matched site, row count, gross and
   net, and its findings. Tabs are matched to sites by `sites.sheet_key` —
   the workbook's tab name — using the same case- and space-insensitive rule as
   the database's unique index, then by site name. Anything less certain is left
   for the operator to assign by hand. Nothing is written until the operator
   confirms.

4. **Commit.** One `import_payroll_sheet(...)` call per sheet. The function
   replaces the period's rows in a single transaction, so a sheet either lands
   completely or not at all, and re-uploading the same file replaces rather
   than duplicates. Imported sheets arrive as **drafts**; a sheet that is
   already `submitted` or `approved` is refused, because someone has signed off
   on it. Every import writes an `approval_logs` entry.

## Number and text handling

Arabic-Indic digits (`٠١٢٣٤٥٦٧٨٩`, `۰۱۲۳۴۵۶۷۸۹`), the Arabic decimal and
thousands separators (`٫` `٬`), Latin thousands separators, accounting
negatives `(250.50)`, and currency wording are all read. Blank cells and the
dashes people use for "nothing here" read as 0; anything else non-numeric is an
error, not a silent zero.

Headings are matched after folding the variation Egyptian data entry produces:
`أ إ آ ٱ → ا`, `ة → ه`, `ى → ي`, `ؤ → و`, `ئ → ي`, plus diacritics, tatweel,
invisible bidi marks, punctuation and case. `أجازة سنوية` and `اجازه سنوي` are
the same column. Longer headings win, so `فئة المواصلات` is never read as
`مواصلات`.

## Tests

```bash
npm test          # parser, Arabic layer, site matching
```

The database function has its own suite, run against a local Postgres rather
than production:

```bash
initdb -D /tmp/pgtest/data -U plpm --auth=trust
pg_ctl -D /tmp/pgtest/data -o '-p 55432 -k /tmp/pgtest' start
psql -h /tmp/pgtest -p 55432 -U plpm -d postgres -f supabase/tests/local_schema.sql
psql -h /tmp/pgtest -p 55432 -U plpm -d postgres -f supabase/migrations/20260828000001_payroll_import_function.sql
psql -h /tmp/pgtest -p 55432 -U plpm -d postgres -f supabase/tests/import_payroll_sheet_test.sql
```

It covers replacement without duplication, refusal of submitted and approved
sheets, every validation refusal, totals recomputation, 2,000 rows in one call,
and — importantly — that a failure part-way through rolls the deletion back, so
a failed import cannot lose the rows it was replacing.

`src/lib/import/__tests__/production-roundtrip.test.ts` rebuilds a real month
of production rows into a workbook and checks the parser returns every value
unchanged. It is skipped unless `PLPM_PROD_FIXTURE` points at a JSON dump of
`payroll_records` rows.
