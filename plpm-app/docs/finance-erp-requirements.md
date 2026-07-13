# PLPM Finance ERP — Requirements Findings & Build Plan

Source: Financial Manager questionnaire, answered July 2026.
This document translates the answers into scope decisions and a phased build plan
for extending the existing PLPM dashboard (payroll + site expenses + approvals)
into a finance system.

---

## 1. What the answers tell us

### Contracts & revenue (per site)
- Contract value is set by **tender / negotiated financial offer** per project
  (site survey, required works, equipment, headcount → a bespoke monthly price).
  It is *not* a simple headcount × rate formula.
- Contracts include **annual escalation** (per-contract terms).
- Clients apply **penalties/deductions** for: headcount shortfalls, performance
  evaluation, conduct violations, and damages caused by company staff.
- **Extra works billed separately are rare** — a separate invoice is issued only
  occasionally for client-requested supplies or one-off works.

### Invoicing cycle today
1. After month-end, invoice prepared internally **in Excel**.
2. A **monthly meeting per site** with the client's admin reviews the month's
   works and negotiates deductions → final agreed amount, client signs.
3. Excel invoice sent **via WhatsApp group** to the external chartered
   accountant's office in Alexandria.
4. Accountant issues the **ETA e-invoice** (المنظومة) and returns a **PDF**.
5. Company emails the PDF to the client; collection wait begins.

- Company **is registered on ETA**; every invoice must go through the portal.
- Cadence: **one invoice per contract** (even when one client holds several contracts).
- Acceptance condition: invoice value must equal the amount agreed in the
  monthly deductions meeting.
- If an issued invoice's amount must change → a **credit note** (كريديت نوت) is issued.

### Collections & receivables — the biggest pain
- Contract terms: ~**30 days**. Reality: **2–6+ months**, varies by client.
- Tracking today: a single **Excel sheet** of issued invoices (date, client).
  Overdue invoices are discovered manually.
- Payment: mostly **bank transfer**, some **cheques**. No partial payments —
  invoices are settled in full (sometimes several at once when arrears build up).
- Clients **deduct withholding tax (الخصم والإضافة) at source** from invoice value.
- Disputes are very rare (amounts pre-agreed in the monthly meeting).

### Payroll finance (after sheet approval)
- Workers are paid **cash at site**, physically handled by the FM + 4–5 admin staff.
- **Advances (سلف)**:
  - Holiday advances (Eid al-Fitr / al-Adha), recovered in full next month.
  - **Long-term installment advances** (supervisor level and up), tracked in
    Excel, deducted monthly from salary until settled.
- **Social insurance**: only ~**30% enrolled** vs. actual headcount (high worker
  turnover). Company usually bears the full amount; when a share is on the
  worker, it is deducted from salary.
- **Payroll income tax (كسب العمل): not calculated per worker.**

### Suppliers & payables
- Recurring payees: **labor-supply contractors, worker-transport vehicle
  owners, apartment landlords (for expat workers)**, plus misc per-site expenses.
- Payments go out from **HQ office** (like payroll), against **cash receipt
  vouchers**; a few sites pay via the site manager.
- Petty cash / custody (عهدة): an **InstaPay float** for emergencies and for
  **company-vehicle costs** (maintenance, fuel) — needs monthly reconciliation.

### Cash & banks
- **One bank account per legal entity**; the only person with signing /
  payment authority is **the owner (Eng. Mohamed)**.
- Payment authorization: owner only — no threshold ladder needed.
- In a tight month, **payroll is always paid first**; forecasting today is
  informal (chasing clients for cheque/transfer dates).

### Taxes & statutory books — the key scope decision
- Official books are kept by an **external chartered accountant in Alexandria**.
- The new system should **EXPORT data to the accountant — not replace the books.**
  → **No general ledger will be built.** (This cuts the largest possible scope item.)
- All filings apply: VAT 14%, withholding, payroll tax, social insurance.

### Reporting & decisions
- Month-end outputs today: **site headcount reports** and **operations reports
  with photos**.
- The three "every morning" questions requested:
  1. **Headcount at each site** (today's numbers).
  2. **Headcount shortfalls** (عجوزات) — flag gaps for fast intervention.
  3. **Headcount & expenses vs. budget** — within plan or exceeded?
- **A budget per site exists** and performance is compared against it.
- Reports language: **Arabic preferred** → Arabic-first UI/reports.

### People & permissions
- Initial users: **Eng. Mohamed (owner), Adham, Mohamed Ali, Ashraf Mansour**.
- Full role matrix to be defined **after** rollout — start with the existing
  role system plus a finance role; refine later.

### Open item
- **Section 10 (priority ranking of top 3 problems) was left unanswered.**
  The phase order below is a proposal derived from the answers; confirm with
  management before locking Phase 1.

---

## 2. Scope decisions

| Decision | Answer | Consequence |
|---|---|---|
| General ledger? | **No** — export to external accountant | 3–4× effort avoided; build export packs instead |
| Billing model | Fixed negotiated monthly value **per contract**, minus negotiated deductions | Contract registry + monthly invoice per contract with deduction lines + credit notes |
| ETA integration | Stays with the accountant's office | No ETA API work; track invoice **status** and store the returned PDF |
| Payment approvals | Owner only | Simple payment log; no multi-level approval chains for payments |
| Payroll tax engine | Not calculated per worker | Out of scope |
| Partial payments | Don't happen | Simple full-settlement matching, arrears = whole invoices |
| UI language | Arabic-first | RTL layouts and Arabic labels on all new finance screens |

---

## 3. Proposed build plan (phased)

### Phase 1 — Contracts, invoicing & AR aging *(highest value)* — ✅ BUILT
Implemented in `supabase/migrations/20260713000001_finance_phase1_contracts_invoicing.sql`
plus the Clients & Contracts, Invoices, and Receivables & Profit screens.

The cash gap (30-day terms vs. 2–6 month reality) tracked in Excel is the
single biggest finance risk. Build:
- **Client & contract registry**: client entity, sites covered, contract value,
  escalation date/terms, penalty notes.
- **Monthly invoice record per contract**: gross amount, deduction lines (with
  reason: shortfall / evaluation / damages), agreed net, withholding deducted,
  credit notes.
- **Invoice status pipeline**: Draft → Agreed in meeting → Sent to accountant →
  Issued on ETA (attach PDF) → Sent to client → Collected (date, method:
  transfer/cheque).
- **AR aging screen**: per client and per contract — 0–30 / 31–60 / 61–90 /
  90+ days, expected vs. actual collection, overdue alerts.
- **Profit per site**: contract net revenue vs. the payroll + expense costs the
  system already knows.

### Phase 2 — Advances ledger & cash custody — ✅ BUILT
Implemented in `supabase/migrations/20260713000002_finance_phase2_advances_custody.sql`
plus the Advances and Custody screens. Payroll integration: roster prefill
fills the advance column from the ledger; approving a sheet records the
deductions as repayments (reset-to-draft reverts them).

- **Worker advance ledger**: holiday advances (full recovery) and long-term
  installment advances; balance per worker across months; auto-deduction line
  feeding the existing payroll sheets.
- **Custody (عهدة) tracking**: InstaPay float and vehicle costs, with monthly
  reconciliation; cash receipt voucher log for contractor/driver/landlord payments.

### Phase 3 — Morning dashboard & budget vs. actual
- Arabic dashboard answering the three morning questions: site headcount today,
  shortfall flags, budget vs. actual (headcount + expenses) per site.
- **Budget per site** module (monthly plan values) feeding the comparison.

### Phase 4 — Accountant export pack & roles
- One-click monthly export for the Alexandria office: invoices issued,
  collections, payroll totals, expenses, withholding suffered, social insurance —
  replacing the WhatsApp/Excel handoff.
- Refine the role/permission matrix once real usage patterns are known.

---

*Next step: confirm Phase 1 priority with management (section 10 was blank),
then design the Phase 1 data model (clients, contracts, invoices, deductions,
collections) as Supabase migrations.*
