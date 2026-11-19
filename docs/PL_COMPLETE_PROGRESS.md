# P&L Complete — Progress (frontend)

## WP5 frontend + WP6(h) panel — DONE

Built on `feature/pl-complete` (this worktree), branched from `feature/pl-catalogue` (`2463480`).

**What exists now that didn't before this pass:**
- `pl-catalogue-admin` page: a "History" button on both the status-config and category-mapping
  tabs (modal, version list with who/when); a "Preview" button on status-config when a DRAFT
  exists (modal, pick a closed/submitted/approved period, shows active-vs-draft statuses and
  computed values, nothing persisted); the "Activer" button on both tabs now requires
  `FACT_APPROVE_PL_CATALOGUE` to even be visible, and shows a clear, translated message instead
  of a silent no-op when it's missing.
- A new third tab, "FX rates" (`FACT_MANAGE_FX_RATES`-gated, hidden entirely otherwise): lists
  `pl_monthly_exchange_rates` rows with status badges, a "Derive" form (pair + from/to month), and
  a "Confirm all" bulk action for DERIVED/SEED rows.
- `report-detail`: a new "Rates used" button next to the workbook export (same
  `FACT_MANAGE_FX_RATES` gating), opening a read-only modal of per-month min/max rate applied,
  fallback warnings, and frozen-line-rate counts for that period — WP6(h)'s panel, confirmed never
  touching the exported workbook itself.
- Real bug fix, not new UI: every error message on this page was silently swallowed before this
  pass (see `PL_COMPLETE_DECISIONS.md` DEC-WP5F-1) — now backend error text actually reaches the
  screen.

**Evidence:**
- `ng build --configuration production`: 0 errors (3 real TS errors found and fixed along the way
  — `daf-form-field`'s `valueChange` emits `string | number | null`, three handlers were typed
  `string`-only). Remaining warnings are 100% pre-existing/unrelated (other modules' unused
  imports, Sass `@import` deprecation notices) — none touch any file this pass changed.
- Live smoke test against a standalone instance of the backend worktree (not just a build check) —
  see `PL_COMPLETE_DECISIONS.md`'s evidence section for the real request/response pairs. Every new
  model/service in this commit matches the live backend's actual JSON shape exactly.

**Not done / explicitly out of scope for this pass:**
- No automated frontend tests were added (Phase 1's own admin component has none either — this
  pass followed the existing convention rather than introducing a new one unilaterally; flagging
  for the owner rather than silently deciding either way).
- The self-approval rejection's end-to-end UX (two different real users, one creating a draft and
  a different one approving it, watching the error appear) was not exercised live — would need a
  second authenticated session; the error-message plumbing itself was verified by reading the
  exact backend exception/serialization code (`ProblemDetail` + `rule` field), not by guessing.

**Commits** (this worktree, `feature/pl-complete`):
- (see `git log` — decisions doc commit + the implementation commit, both carrying the
  `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>` trailer)

Main (non-worktree) `daf360-facturation-frontend` working copy confirmed untouched throughout
(same pre-existing uncommitted audit-trail/affaire-detail/affaire-wizard/doc360/tsconfig.federation
files, HEAD still `2463480`). Nothing pushed.
