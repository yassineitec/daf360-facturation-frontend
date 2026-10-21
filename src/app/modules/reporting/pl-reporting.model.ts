/**
 * P&L Reporting (F.08) — shared TypeScript interfaces for the whole `reporting` module.
 *
 * Mirrors, field for field, the real backend DTOs already built in
 * `daf360-facturation-service` (`modules/cost/dto/PlPeriodDto`, `modules/reporting/dto/*`) — see
 * `docs/superpowers/plans/2026-10-13-pl-reporting-plan.md` (Phase 3 / Task 3.1) and the design
 * doc `docs/superpowers/specs/2026-10-13-pl-reporting-design.md` in the backend repo. Do not
 * rename a field without checking the Java DTO first.
 */

// ── GroupCatalogueLine ────────────────────────────────────────────────────────

/** The 13 global (not per-pays) P&L catalogue lines: REVENUE + the 12 COST_CATEGORY codes. */
export interface GroupCatalogueLineDto {
  id: number;
  code: string;
  labelFr: string;
  labelEn: string;
  sortOrder: number;
}

// ── PlPeriod ──────────────────────────────────────────────────────────────────

/** `PlPeriod.status` — the cost-close workflow (`FACT_VIEW_COST`/`FACT_MANAGE_COST`). */
export type PlPeriodStatus = 'OPEN' | 'CLOSED' | 'SUBMITTED' | 'APPROVED';

export interface PlPeriodDto {
  id: number;
  paysId: number;
  periodYear: number;
  periodMonth: number;
  status: PlPeriodStatus;
  revenueLocal: number;
  costBillableSalaries: number;
  costSubconsultants: number;
  costOpex: number;
  costSoftwareSubscriptions: number;
  costIntercompany: number;
  costCommunicationMarketing: number;
  totalOperatingCost: number;
  ebitda: number;
  intercompanyInbound: number;
  intersedeInbound: number;
  intersedeOutbound: number;
  wipPreviousYears: number;
  salaryRecharges: number;
  otherCostRecharges: number;
  wipBalanceAtClose: number;
  grossRevenue1Local: number;
  grossRevenue2Local: number;
  netRevenueLocal: number;
  ebitdaPct: number | null;
  closeStartedAt: string | null;
  submittedAt: string | null;
  approvedBy: number | null;
  approvedAt: string | null;
}

/** Body of POST /pl-periods/{id}/close -- the manual waterfall inputs. Every field optional;
 *  the backend treats a missing/null value as zero. */
export interface ClosePeriodRequest {
  intercompanyInbound?: number | null;
  intercompanyOutbound?: number | null;
  intersedeInbound?: number | null;
  intersedeOutbound?: number | null;
  wipPreviousYears?: number | null;
  salaryRecharges?: number | null;
  otherCostRecharges?: number | null;
}

export interface CreatePlPeriodRequest {
  paysId: number;
  periodYear: number;
  periodMonth: number;
}

// ── PlReport ──────────────────────────────────────────────────────────────────

/** `PlReport.status` — the F.08 submission/endorsement/acceptance workflow. */
export type PlReportStatus =
  | 'DRAFT' | 'SUBMITTED' | 'CD_ENDORSED' | 'GROUP_ACCEPTED'
  | 'AMENDMENT_REQUESTED' | 'SUPERSEDED';

export interface PlReportDto {
  id: number;
  paysId: number;
  periodYear: number;
  periodMonth: number;
  version: number;
  plPeriodId: number;
  status: PlReportStatus;
  submittedBy: number | null;
  submittedAt: string | null;
  cdEndorsedBy: number | null;
  cdEndorsedAt: string | null;
  groupAcceptedBy: number | null;
  groupAcceptedAt: string | null;
  previousVersionId: number | null;
  supersessionReason: string | null;
  reopenMethod: string | null;
  reopenRationale: string | null;
  createdAt: string;
  updatedAt: string | null;
}

export interface PlReportLineDto {
  id: number;
  plReportId: number;
  catalogueLineId: number;
  catalogueLineCode: string;
  catalogueLineLabelFr: string;
  catalogueLineLabelEn: string;
  sortOrder: number;
  amountLocal: number;
  amountEur: number;
  budgetAmountLocal: number | null;
  /** Already ×100 — e.g. `12.34` means +12.34%. */
  variancePct: number | null;
}

/** `GET /api/fact/pl-reports/{id}` — lines pre-sorted by `sortOrder` (REVENUE first). */
export interface PlReportDetailDto {
  report: PlReportDto;
  lines: PlReportLineDto[];
}

export type ReopenMethod = 'OPTION_1_VERSIONED' | 'OPTION_2_CONSUMED';

export interface ReopenReportRequest {
  method: ReopenMethod;
  rationale: string;
}

export interface RequestAmendmentRequest {
  reason: string;
}

// ── VarianceCommentary ───────────────────────────────────────────────────────

/** `null` for a per-line row; one of these four for the cross-cutting sections. */
export type VarianceSectionType = 'REVENUE' | 'COST' | 'EBITDA' | 'OTHER_NOTABLE';

export type VarianceCommentaryStatus = 'DRAFT' | 'UNDER_REVIEW';

export interface VarianceCommentaryDto {
  id: number;
  plReportId: number;
  catalogueLineId: number | null;
  sectionType: VarianceSectionType | null;
  varianceVsBudget: number | null;
  varianceVsPrior: number | null;
  narrative: string;
  aiDraftReference: string | null;
  authoredBy: number | null;
  reviewedBy: number | null;
  status: VarianceCommentaryStatus;
}

export interface UpdateCommentaryRequest {
  narrative: string;
}

// ── BudgetReference / BudgetLine ─────────────────────────────────────────────

export interface BudgetLineDto {
  id: number;
  catalogueLineId: number;
  month: number;
  amountLocal: number;
  currency: string;
}

export interface BudgetLineUpsert {
  catalogueLineId: number;
  month: number;
  amountLocal: number;
  currency: string;
}

export interface BudgetReferenceDto {
  id: number;
  paysId: number;
  year: number;
  version: number;
  loadedFrom: string;
  loadedBy: number | null;
  loadedAt: string;
  approvedBy: number | null;
  groupApprovedBy: number | null;
  approvalDate: string | null;
  previousVersionId: number | null;
  lines: BudgetLineDto[];
}

export interface UpsertBudgetLinesRequest {
  lines: BudgetLineUpsert[];
}

// ── SubmissionCalendar ───────────────────────────────────────────────────────

export interface SubmissionCalendarDto {
  id: number;
  year: number;
  month: number;
  submissionDeadline: string;
  setBy: number | null;
  setAt: string;
}

export interface UpsertSubmissionCalendarRequest {
  year: number;
  month: number;
  deadline: string;
}

// ── Cash position (Receivables / Missing Cash) ──────────────────────────────

/** `GET /api/fact/pl-reports/receivables?paysId=` -- one currently-unpaid invoice, with ageing
 *  against its due date. `clientType` is always `"External"` today (a real, current backend
 *  fact -- see `CashPositionService`'s `CLIENT_TYPE_EXTERNAL` constant -- not a placeholder). */
export interface ReceivableLineDto {
  invoiceNumber: string;
  clientName: string;
  clientType: string;
  emittedAt: string;
  dueDate: string;
  amountIncTax: number;
  amountExTax: number;
  currency: string;
  daysAgeing: number;
  ageingCategory: 'Not Overdue' | '<30 Days' | '31-60 Days'
                | '61-180 Days' | '181-365 Days' | '> 365 Days';
}

/** `GET /api/fact/pl-reports/missing-cash?paysId=` -- one row per affaire with open receivables
 *  and/or unbilled WIP. `wipTotal` is a single figure, not broken down by age: no per-affaire
 *  WIP-ageing data source exists in the backend today (v1 scope, documented on the Java DTO).
 *  Rows arrive pre-sorted descending by `missingCashTotal` -- do not re-sort client-side. */
export interface MissingCashRowDto {
  projectRef: string;
  arTotal: number;
  arNotOverdue: number;
  arLt1Month: number;
  ar1To2Months: number;
  ar2To3Months: number;
  ar3To6Months: number;
  ar6To12Months: number;
  arGt1Year: number;
  wipTotal: number;
  missingCashTotal: number;
}
