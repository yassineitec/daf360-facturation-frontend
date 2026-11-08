# P&L catalogue — complete: admin UI for preview, history, two-person activation, FX rates

## Summary

Frontend half of the P&L catalogue completion effort (backend in `daf360-facturation-service`'s
`feature/pl-complete`, see that repo's `docs/PL_COMPLETE_DECISIONS.md` for the full cross-repo
history). Builds the admin UI for backend capability that previously had no frontend at all.

## What changed

- **`pl-catalogue-admin` component**: status-config tab gains a "Preview" action (DRAFT config
  against a chosen closed period, nothing persisted) and a version-history view. Category-mapping
  tab gains version history. Both tabs' "Activer" buttons now reflect genuine two-person
  enforcement — a user cannot approve their own draft (`FACT_APPROVE_PL_CATALOGUE` permission,
  server-enforced; the UI surfaces the rejection clearly rather than a generic error).
- **New "FX rates" tab/screen**, gated by the new `FACT_MANAGE_FX_RATES` permission (distinct from
  `FACT_ADMIN_PL_CATALOGUE` — this is a Finance-internal concern): rate list with status badges
  (SEED/DERIVED/SOURCED/CONFIRMED), a `derive` action (proposes rates from the system's own stored
  data for a chosen pair/month-range), and a bulk "Confirm" action.
- **"Rates used" panel** on the report-detail export screen: before export, shows per-month
  min/max rate actually applied, which months fell back to an earlier rate, which lines used a
  frozen line-level rate. Currently shows nothing (0 conversions through the new FX component in
  this dev DB yet, see the backend PR) — this is correct, not broken.
- **Real pre-existing bug found and fixed**: every error handler in this module read
  `err.error?.message`, but the backend's `GlobalExceptionHandler` returns Spring `ProblemDetail`
  (field `detail`) — backend error text has never reached these screens since Phase 1 shipped.
  Fixed at all 6 existing call sites plus the new ones this PR adds.

## Test plan

`ng build --configuration production`: 0 errors. Live smoke-tested against a real running backend
instance (dev mode) — every new endpoint's response matched the TypeScript models field-for-field,
including real FX-rate data from an earlier `derive` run (Sep 2026 CONFIRMED, Oct 2026 DERIVED).
No new automated frontend tests (matches this module's own pre-existing precedent from Phase 1,
not silently decided). The two-person self-approval-rejection flow was verified via source
inspection, not an end-to-end two-user live test.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
