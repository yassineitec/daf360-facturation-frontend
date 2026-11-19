# P&L Complete — Decisions Log (frontend)

Frontend half of PROMPT_MASTER_pl_complete_autonomous_official.md's WP5 ("admin screens... previews
and history from WP1") and WP6(h)'s "rates used" panel. Backend-side decisions live in
`daf360-facturation-service`'s own `docs/PL_COMPLETE_DECISIONS.md` (separate log, separate repo) —
this file only covers judgment calls made while building the UI that consumes that backend.

## DEC-WP5F-1 — a real pre-existing bug fixed as a prerequisite: `err.error?.message` never worked

Every error handler in `pl-catalogue-admin.component.ts` (6 call sites, all from Phase 1) read
`err.error?.message`. The backend's `GlobalExceptionHandler` returns Spring's `ProblemDetail` on
every exception path (`BusinessRuleException`, validation errors, etc.) — that type's field is
`detail`, not `message`. `err.error?.message` has therefore always been `undefined`, and every
failure on this screen has always silently shown the generic fallback translation instead of the
real backend error text, since Phase 1 shipped. Not something this pass introduced — found while
implementing the one new requirement that actually needs a real backend error to surface (WP1(c)'s
self-approval rejection, `RG_PL_CATALOGUE_SELF_APPROVAL`): that message could never have reached a
user under the old code, no matter what UI was built around it.

Fixed via a new `backendErrorMessage(err, fallbackKey)` helper, used at all 6 existing call sites
plus every new one added in this pass. It also special-cases `err.error?.rule ===
'RG_PL_CATALOGUE_SELF_APPROVAL'` with a dedicated, translated, friendlier message
(`SELF_APPROVAL_ERROR`) rather than surfacing the backend's raw English sentence verbatim.

## DEC-WP5F-2 — FX-rates admin: a third tab on the existing page, not a separate route

`PlFxRateAdminController` is gated by `FACT_MANAGE_FX_RATES`, a different permission from
`FACT_ADMIN_PL_CATALOGUE` (the existing two tabs). Considered a separate page/route for a cleaner
permission boundary, but the existing `pl-catalogue-admin` page already conditionally hides content
by permission within itself (the per-tab Activer-button gating added in this same pass), and a
Finance Manager plausibly also holds `FACT_ADMIN_PL_CATALOGUE` and benefits from one page rather
than two bookmarks for the same overall "P&L catalogue administration" concern. The tab itself
(`tabs()`) only appears when `canManageFxRates()` is true — someone without the permission never
sees it exists, not just a disabled/blocked version of it. Every FX call is still independently
gated server-side regardless of what the tab shows.

## DEC-WP5F-3 — FX month inputs are plain text fields, not a native month picker

`FormFieldOptions`'s `type` union isn't confirmed (from reading usage elsewhere in this codebase)
to include a month-only variant — only `text`/`textarea` are confirmed in use. Rather than guess an
unsupported enum value (which could be a silent runtime issue even if it compiled), used plain text
inputs with a `YYYY-MM` placeholder and a client-side regex guard (`fxCanDerive()`) disabling the
Derive button until both fields match `/^\d{4}-(0[1-9]|1[0-2])$/`. This is also literally the wire
format `DeriveRatesRequest.fromMonth`/`toMonth` need (Java `YearMonth` JSON round-trips as
`"YYYY-MM"`), so no conversion step was needed either way.

## DEC-WP5F-4 — Preview's period picker: `CLOSED`/`SUBMITTED`/`APPROVED`, not `CLOSED` only

`PlCataloguePreviewResultDto`'s endpoint takes any `periodId`; the master document's WP1(c) describes
preview as "a chosen CLOSED period." Rather than hand-roll a second status filter that could drift
from whatever the backend actually accepts, the period dropdown (`previewPeriodOptions`) excludes
only `OPEN` periods and shows the real status in the option label (e.g. "2026-01 (SUBMITTED)") so a
user can see exactly what they're picking — the backend is the authority on what's actually valid to
preview against, this is just sensible UX filtering, not a correctness boundary.

## DEC-WP5F-5 — Confirm is "confirm every DERIVED/SEED row currently listed," not row-by-row

WP6(i)/DEC19 describes "a bulk Confirm action." Built one button that confirms every row with status
`DERIVED` or `SEED` in the currently-loaded list (`fxConfirmableIds`) rather than per-row checkboxes
— simpler, and matches "bulk" literally. `REVIEW`-status rows (spread > 2%) are deliberately excluded
from the confirmable set: those need a human to actually look at the spread before confirming, a
blind bulk-confirm defeats the point of flagging them. `CONFIRMED` rows are already excluded by
construction (the backend never un-confirms, confirming is a no-op server-side but there's no reason
to resend IDs that can't change).

## Live smoke-test evidence (not just `ng build`)

Built the backend worktree (`daf360-facturation-service-pl-complete`, HEAD at WP6's `7b392c0`) into
a jar and ran it standalone (`--spring.profiles.active=local --server.port=8897`, `jwt-disabled`
defaults `true` under that profile — no credentials needed, dev principal auto-authenticates) against
the real local dev DB. Hit the new endpoints directly:

- `GET .../status-config/history?sourceType=COST_BOOKED` → `200 []` (empty, no versions created yet
  for this source type — correctly shaped empty array, not an error).
- `GET .../category-mapping/history` → `200`, two real version objects (v2 ACTIVE, v1 ARCHIVED),
  every field (`version`, `configStatus`, `entries[]`, `createdBy`, `createdAt`, `approvedBy`,
  `approvedAt`) present and matching `PlCategoryLineMappingVersionDto` exactly, no renamed/missing
  fields on either side.
- `GET /api/fact/admin/pl-fx-rates?currencyPair=TND/EUR` → `200`, the exact two real `DERIVED`
  rows produced by WP6(i)'s live `derive` run earlier this session (Sep 2026 CONFIRMED, Oct 2026
  DERIVED), every field matching `PlMonthlyExchangeRateDto` exactly.
- `GET /api/fact/admin/pl-fx-rates/used/39` → `200 []` (no FX conversion applied for Tunisia period
  39 — consistent with WP6(a)'s finding that this dev DB has almost no live TND data to convert).

Every response shape matched the TypeScript models in this commit field-for-field on the first try —
no mismatch found, nothing needed correcting after this check. Standalone instance killed and its
jar/target directory left in place in the backend worktree (not cleaned up — it's a disposable build
artifact of that worktree, not tracked by git, no cleanup needed). The `node_modules` junction created
in this worktree to run `ng build` was removed afterward; it is not committed (not tracked, and would
not survive `git status` as anything other than a missing directory for the next person regardless).
