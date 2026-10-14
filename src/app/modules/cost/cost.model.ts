import type { PageResponse } from '../affaires/affaire.model';
import { currencyFractionDigits } from '../../shared/currency-decimals.util';
export type { PageResponse };

// ── Configurable list DTOs (match backend ListValueDto / ListTypeDto exactly) ──

export interface ListValueDto {
  id: number;
  typeCode: string;
  paysId: number | null;
  code: string;
  labelFr: string;
  labelEn: string | null;
  displayOrder: number;
  isDefault: boolean;
  isActive: boolean;
  metadata: string | null;
  /**
   * Justificatif obligatoire — porté uniquement par les valeurs `EXPENSE_CATEGORY`
   * (frais remboursables). `null` sur tout autre type de liste, et traité comme
   * « non exigé » : une catégorie sans règle explicite ne bloque pas la saisie.
   */
  requiresReceipt?: boolean | null;
  /**
   * D3 cost-management taxonomy metadata (V78) — populated for `COST_CATEGORY`
   * (all fields below) and `COST_SUB_CATEGORY` (`parentValueId` only). `null` for
   * every other list type.
   */
  parentValueId?: number | null;
  isCapex?: boolean | null;
  isOverhead?: boolean | null;
  isDirect?: boolean | null;
  requiresSupplier?: boolean | null;
  requiresDocument?: boolean | null;
  approvalRequiredFromAmount?: number | null;
  /** 'MANUAL' | 'AUTO_PUSH' — only populated for COST_CATEGORY rows. */
  sourceType?: string | null;
  autoPushModule?: string | null;
  isStrictScrutiny?: boolean | null;
  descriptionFr?: string | null;
  descriptionEn?: string | null;
  /**
   * COST_SUB_CATEGORY only: the `code` of the parent category. Sub-categories are matched
   * to a category by CODE — a country override of a global category is a new row (new
   * id), while the global sub-categories keep pointing at the global row's id.
   */
  parentValueCode?: string | null;
  /**
   * Whole percentage (e.g. `19`, not `0.19`) — only populated for `VAT_RATE` and
   * `WITHHOLDING_RATE` rows. `null` for every other list type.
   */
  ratePct?: number | null;
  /** `WITHHOLDING_RATE` only (V92): what the rate applies to. */
  taxBase?: WithholdingBase | null;
}

/**
 * Base of a retenue à la source rate (V101): HT + FODEC + TVA (timbre and autres taxes
 * excluded), or the TVA amount alone (retenue sur TVA). The other codes only survive on
 * invoices saved earlier, whose stored amounts are kept: 'HT_FODEC' (V95 → V101),
 * 'HT' / 'TTC' (before V95).
 */
export type WithholdingBase = 'HT_FOD_TVA' | 'TVA' | 'HT_FODEC' | 'HT' | 'TTC';

/** Bases offered when configuring a WITHHOLDING_RATE value. */
export const WITHHOLDING_BASES: readonly WithholdingBase[] = ['HT_FOD_TVA', 'TVA'];

/** List type of the "autres taxes" kinds (V95) — Admin → Listes. */
export const OTHER_TAX_TYPE_LIST = 'OTHER_TAX_TYPE';

/** Body of `POST /admin/lists/{type}/values` — taxonomy fields only read for COST_CATEGORY / COST_SUB_CATEGORY. */
export interface CreateListValueBody extends TaxonomyFields {
  typeCode: string;
  paysId: number;
  code: string;
  labelFr: string;
  labelEn?: string;
  displayOrder?: number;
  isDefault?: boolean;
  /** Justificatif obligatoire — n'a de sens que pour EXPENSE_CATEGORY. */
  requiresReceipt?: boolean;
  /** Whole percentage (e.g. `19`) — n'a de sens que pour VAT_RATE / WITHHOLDING_RATE. */
  ratePct?: number;
  /** WITHHOLDING_RATE uniquement. */
  taxBase?: WithholdingBase;
}

/** Body of `PATCH /admin/lists/values/{id}` — `undefined` = unchanged. */
export interface UpdateListValueBody extends TaxonomyFields {
  labelFr?: string;
  labelEn?: string;
  isDefault?: boolean;
  isActive?: boolean;
  requiresReceipt?: boolean;
  /** Whole percentage (e.g. `19`) — n'a de sens que pour VAT_RATE / WITHHOLDING_RATE. */
  ratePct?: number;
  /** WITHHOLDING_RATE uniquement. */
  taxBase?: WithholdingBase;
}

export interface TaxonomyFields {
  parentValueId?: number;
  isCapex?: boolean;
  isOverhead?: boolean;
  isDirect?: boolean;
  sourceType?: 'MANUAL' | 'AUTO_PUSH';
  autoPushModule?: string;
  isStrictScrutiny?: boolean;
  descriptionFr?: string;
  descriptionEn?: string;
}

export interface ListTypeDto {
  id: number;
  code: string;
  labelFr: string;
  labelEn: string | null;
  isGlobal: boolean;
  isActive: boolean;
}

// Cost categories are ListValueDto rows of type COST_CATEGORY / COST_SUB_CATEGORY
// (one source since V84 — the legacy CostCategoryDto / cost_categories is gone).

export interface CreateCostApprovalThresholdRequest {
  paysId: number;
  /** COST_CATEGORY list value; null = every category of the pays. */
  costCategoryId?: number | null;
  level: string;
  minAmountEur: number;
  maxAmountEur?: number | null;
  approverRoleCode?: string | null;
}

// ── Approval threshold (matches backend CostApprovalThresholdDto) ─────────────

export interface CostApprovalThresholdDto {
  id: number;
  paysId: number;
  /** COST_CATEGORY list value; null = every category of the pays. */
  costCategoryId: number | null;
  level: string;            // L1 | L2 | L3 | L4
  minAmountEur: number;
  maxAmountEur: number | null;
  approverRoleCode: string | null;
  isActive: boolean;
}

export function isAutoApproveLevel(level: string): boolean { return level === 'L1'; }
export function isDualApprovalLevel(level: string): boolean { return level === 'L4'; }

// ── Cost line approval record ─────────────────────────────────────────────────

export interface CostApprovalRecordDto {
  id: number;
  costLineId: number;
  level: string;
  approverId: number | null;
  decision: string;          // APPROVED | AUTO_APPROVED | RETURNED | REJECTED
  comment: string | null;
  decisionDate: string | null;
}

// ── Cost line DTO (matches backend CostLineDto record field-for-field) ─────────

export type CostLineStatus =
  'DRAFT' | 'SUBMITTED' | 'RETURNED' |
  'APPROVED' | 'VALIDATED' | 'POSTED' |
  'CANCELLED' | 'REJECTED';

export interface CostLineDto {
  id: number;
  paysId: number;
  periodYear: number;
  periodMonth: number;
  transactionDate: string | null;
  /** Legacy cost_categories id, history only. Read costCategoryId/costCategoryLabel instead
   *  (V84 backfilled them for every legacy line). */
  categoryId: number | null;
  /** COST_CATEGORY configurable list — the category of the line. */
  costCategoryId: number | null;
  costCategoryLabel: string | null;
  /** English label of the same list value (admin → listes) — display-only. */
  costCategoryLabelEn?: string | null;
  /** New taxonomy (V78) — COST_SUB_CATEGORY configurable list. Null if no sub-category chosen. */
  costSubCategoryId: number | null;
  costSubCategoryLabel: string | null;
  costSubCategoryLabelEn?: string | null;
  reference?: string | null;
  label: string | null;           // backend field name is "label"
  originModule: string | null;
  originReferenceId: string | null;
  profileUserId: number | null;
  projectId: string | null;
  affaireId: number | null;
  supplierId: number | null;
  supplierNameFree: string | null;
  /** Display name: the linked supplier's name, else `supplierNameFree` (resolved server-side). */
  supplierName?: string | null;
  netAmountLocal: number | null;
  vatAmountLocal: number | null;
  grossAmountLocal: number | null;
  // D3 Tunisian tax fields (V78) — populated only when a supplier is attached.
  fodecRate: number | null;
  fodecAmount: number | null;
  tvaRate: number | null;
  autresTaxesRate: number | null;
  autresTaxesAmount: number | null;
  /** Base the RS was computed on (V92) — `null` without RS. */
  autresTaxesBase?: WithholdingBase | null;
  timbreAmount: number | null;
  currency: string | null;        // currency code string
  currencyId: number | null;
  netAmountEur: number | null;    // backend field name is "netAmountEur"
  recurrenceFlag: boolean | null; // backend field name is "recurrenceFlag"
  recurrenceFrequencyId: number | null;
  costTypeId: number | null;
  paymentMethodId: number | null;
  approvalLevelRequired: string | null;
  status: CostLineStatus;
  submittedBy: number | null;
  submittedAt: string | null;
  validatedBy: number | null;
  validatedAt: string | null;
  postedAt: string | null;
  documentUrl: string | null;
  notes: string | null;
  /** Always empty since V93 — the approval history belongs to the invoice. */
  approvals: CostApprovalRecordDto[];
  dualApprovalDone: boolean | null;
  /** The cost invoice holding this line (V93). */
  costInvoiceId?: number | null;
  /** V102 — part of the HT subject to FODEC / TVA / RS; `null` = the whole HT. */
  vatBaseLocal?: number | null;
  /** V102 — HT − base: part outside the VAT scope (e.g. air fare); 0 on a standard line. */
  nonTaxableAmountLocal?: number | null;
}

// ── Cost invoice (V93) — a supplier invoice holding one or more cost lines ────────
//
// The invoice is the unit of entry, approval, payment and attachments. FODEC and TVA stay
// per line (fixed formula); stamp duty and retenue à la source are applied once per
// invoice. Matches backend CostInvoiceDto field-for-field.

export interface CostInvoiceApprovalDto {
  id: number;
  costInvoiceId: number;
  level: string;
  approverId: number | null;
  decision: string;          // APPROVED | AUTO_APPROVED | RETURNED | REJECTED
  comment: string | null;
  decisionDate: string | null;
}

export interface VatBreakdownDto {
  /** Fraction (0.19); `null` = VAT typed by hand (no rate). */
  tvaRate: number | null;
  baseAmount: number;
  vatAmount: number;
}

export interface CostInvoiceReglementDto {
  id: number;
  costInvoiceId: number;
  montantPaye: number;
  datePaiement: string;
  comment: string | null;
}

export interface CostInvoiceDto {
  id: number;
  paysId: number;
  reference: string;
  supplierId: number | null;
  /** Linked supplier's name, else `supplierNameFree`. */
  supplierName: string | null;
  supplierNameFree: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: string;
  periodYear: number;
  periodMonth: number;
  currency: string;
  currencyId: number | null;
  netAmountLocal: number;
  fodecAmount: number | null;
  vatAmountLocal: number;
  timbreAmount: number | null;
  /** Σ "autres taxes" (V95) — added to the TTC. */
  otherTaxesAmount: number | null;
  grossAmountLocal: number;
  netAmountEur: number | null;
  grossAmountEur: number | null;
  rsRate: number | null;
  rsBase: WithholdingBase | null;
  rsAmount: number | null;
  /** TTC − retenue à la source: what is actually paid to the supplier. */
  netToPay: number;
  status: CostLineStatus;
  approvalLevelRequired: string | null;
  submittedBy: number | null;
  submittedAt: string | null;
  validatedBy: number | null;
  validatedAt: string | null;
  postedAt: string | null;
  paymentDueDate: string | null;
  notes: string | null;
  originModule: string;
  createdAt: string | null;
  lines: CostLineDto[];
  vatBreakdown: VatBreakdownDto[];
  otherTaxes: CostInvoiceOtherTaxDto[];
  approvals: CostInvoiceApprovalDto[];
  dualApprovalDone: boolean | null;
  reglement: CostInvoiceReglementDto | null;
  /** V102 — Σ of the lines' part outside the VAT scope; 0 when none. */
  nonTaxableAmountLocal?: number | null;
}

/** One line of the invoice form. `id` = existing line (kept), absent = new line. */
export interface CostInvoiceLineRequest {
  id?: number | null;
  costCategoryId: number | null;
  costSubCategoryId?: number | null;
  description: string;
  /** The whole cost of the line: taxable part + part outside the VAT scope. */
  netAmountLocal: number;
  /** V102 — part of the HT subject to FODEC / TVA / RS (0 ≤ base ≤ HT); absent = the whole HT. */
  vatBaseLocal?: number | null;
  /** Typed VAT — only used when no `tvaRate` applies (no supplier). */
  vatAmountLocal?: number | null;
  /** Fractions (0.01, 0.19) — supplier invoices only. */
  fodecRate?: number | null;
  tvaRate?: number | null;
  affaireId?: number | null;
  costTypeId?: number | null;
}

export interface CreateCostInvoiceRequest {
  paysId: number;
  supplierId?: number | null;
  supplierNameFree?: string | null;
  /** Required with a supplier; unique per supplier. */
  supplierInvoiceNumber?: string | null;
  invoiceDate: string;          // YYYY-MM-DD — the period derives from it
  currencyId: number;
  /** Once per invoice — supplier invoices only. */
  timbreAmount?: number | null;
  /** Fraction (0.015), once per invoice — supplier invoices only. */
  rsRate?: number | null;
  paymentDueDate?: string | null;
  notes?: string | null;
  lines: CostInvoiceLineRequest[];
  /** Free "autres taxes" (V95), replaced as a whole on each save. */
  otherTaxes?: CostInvoiceOtherTaxRequest[];
}

/** One "autre taxe" of an invoice: a type (OTHER_TAX_TYPE) and/or a label, and a free amount. */
export interface CostInvoiceOtherTaxRequest {
  taxTypeId: number | null;
  label: string | null;
  amountLocal: number;
}

export interface CostInvoiceOtherTaxDto {
  id: number;
  taxTypeId: number | null;
  taxTypeCode: string | null;
  taxTypeLabel: string | null;
  taxTypeLabelEn: string | null;
  label: string | null;
  amountLocal: number;
}

// ── Edit after validation, DAF only (V94) ─────────────────────────────────────

/** Permission for editing an APPROVED / POSTED cost invoice (workshop item #5). */
export const FACT_EDIT_VALIDATED_COST = 'FACT_EDIT_VALIDATED_COST';

/** Statuses a cost invoice can be edited in by the DAF (a draft is edited normally). */
export const VALIDATED_EDITABLE_STATUSES: readonly string[] = ['APPROVED', 'VALIDATED', 'POSTED'];

export interface CostInvoiceChangeEntry {
  /** HEADER, LINE or TOTAL */
  scope: 'HEADER' | 'LINE' | 'TOTAL';
  /** The line concerned (LINE only). */
  lineReference: string | null;
  /** Stable code — translated with COST.CHANGES.FIELD.<field>. */
  field: string;
  before: string;
  after: string;
}

export interface CostInvoiceChangeDto {
  id: number;
  costInvoiceId: number;
  changedBy: number;
  changedAt: string;
  statusAtChange: string;
  justification: string;
  grossBefore: number | null;
  grossAfter: number | null;
  changes: CostInvoiceChangeEntry[];
}

// ── Historical import (V93, workshop item #4) ─────────────────────────────────

export interface CostInvoiceImportResult {
  batchId: number | null;
  /** true = check only, nothing saved */
  dryRun: boolean;
  /** true = the invoices were saved */
  committed: boolean;
  totalRows: number;
  invoiceCount: number;
  errorCount: number;
  errors: string[];
  references: string[];
  /** Suppliers of the file absent from CORE360 — never created by the import; any entry blocks it. */
  missingSuppliers: CostImportMissingSupplier[];
}

export interface CostImportMissingSupplier {
  code: string | null;
  taxId: string | null;
  name: string | null;
  /** File rows naming it, e.g. "12, 13, 40". */
  rows: string;
  invoiceCount: number;
}

export interface CostInvoiceAttachmentDto {
  id: number;
  costInvoiceId: number;
  fileName: string;
  fileSizeBytes?: number | null;
  fileType?: string | null;
  uploadedBy?: number | null;
  uploadedAt: string;
  /** Relative API path — GET it with the HttpClient (auth header), not a plain link. */
  downloadUrl?: string | null;
}

/**
 * A configurable-list label in the UI language (`lang` = `translate.currentLang()`):
 * the English one when the UI is in English and the admin filled it, the French one otherwise.
 */
export function localizedLabel(
  fr: string | null | undefined, en: string | null | undefined, lang: string | null | undefined,
): string | null {
  return ((lang ?? '').startsWith('en') && en) || fr || null;
}

/**
 * "Catégorie › Sous-catégorie" as shown in lists, cards and the detail page — read from
 * the labels the backend resolves on the line, so every screen shows the same thing.
 */
export function costCategoryDisplay(line: Pick<CostLineDto, 'costCategoryLabel' | 'costSubCategoryLabel'>): string {
  if (!line.costCategoryLabel) return '—';
  return line.costSubCategoryLabel
    ? `${line.costCategoryLabel} › ${line.costSubCategoryLabel}`
    : line.costCategoryLabel;
}

// Cost lines are created and edited through their invoice since V93 — see
// CreateCostInvoiceRequest above (the per-line CreateCostLineRequest is gone).

// The import result is CostInvoiceImportResult (historical import, V93) — see above.

// ── UI helpers ─────────────────────────────────────────────────────────────────

export interface CostStatusConfig {
  label: string;
  bg: string;
  text: string;
}

export const COST_STATUS_CONFIG: Record<CostLineStatus, CostStatusConfig> = {
  DRAFT:     { label: 'Brouillon',   bg: '#f1f5f9', text: '#475569' },
  SUBMITTED: { label: 'Soumis',      bg: '#dbeafe', text: '#1d4ed8' },
  RETURNED:  { label: 'Retourné',    bg: '#fef3c7', text: '#92400e' },
  APPROVED:  { label: 'Approuvé',    bg: '#d1fae5', text: '#065f46' },
  VALIDATED: { label: 'Validé',      bg: '#e6f7f5', text: '#00695c' },
  POSTED:    { label: 'Comptabilisé',bg: '#e0e7ff', text: '#3730a3' },
  CANCELLED: { label: 'Annulé',      bg: '#fee2e2', text: '#991b1b' },
  REJECTED:  { label: 'Rejeté',      bg: '#fee2e2', text: '#991b1b' },
};

export const APPROVAL_LEVEL_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  L1: { label: 'L1 — Auto', bg: '#f1f5f9', text: '#475569' },
  L2: { label: 'L2 — Finance', bg: '#dbeafe', text: '#1d4ed8' },
  L3: { label: 'L3 — Directeur', bg: '#fef3c7', text: '#92400e' },
  L4: { label: 'L4 — Dual', bg: '#fee2e2', text: '#991b1b' },
};

export function formatAmountEur(amount: number | null): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
  }).format(amount);
}

export function formatAmount(amount: number | null, currency = 'EUR'): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency,
    }).format(amount);
  } catch {
    return `${amount.toFixed(currencyFractionDigits(currency))} ${currency}`;
  }
}

// ── D3-115/127 additional types ───────────────────────────────────────────────

export interface ForexPreviewDto {
  local: number;
  deviseLocal: string;
  tauxEur: number;
  montantEur: number;
  tauxChf: number;
  montantChf: number;
}

export interface CircuitPreviewDto {
  level: string;
  description: string;
  dualApproval: boolean;
  autoApprove: boolean;
  approverRoles: string[];
}

// ── Category icon map (for approval-queue cards) ──────────────────────────────

export const CATEGORY_ICON: Record<string, { icon: string; color: string; bg: string }> = {
  INFRA_IT:    { icon: 'dns',            color: '#4648d4', bg: '#eff0ff' },
  VOYAGE:      { icon: 'flight_takeoff', color: '#006b58', bg: '#f0fdf4' },
  LOGISTIQUE:  { icon: 'local_shipping', color: '#64748B', bg: '#F1F5F9' },
  FORMATION:   { icon: 'school',         color: '#7e22ce', bg: '#f5f0ff' },
  MARKETING:   { icon: 'campaign',       color: '#D97706', bg: '#FFFBEB' },
  BIEN_ETRE:   { icon: 'spa',            color: '#065f46', bg: '#d1fae5' },
  COUT_PROJET: { icon: 'construction',   color: '#ba1a1a', bg: '#ffdad6' },
  FOURNITURE:  { icon: 'edit',           color: '#64748B', bg: '#F1F5F9' },
  DEFAULT:     { icon: 'receipt_long',   color: '#64748B', bg: '#F1F5F9' },
};

// ── Rate computation ──────────────────────────────────────────────────────────

export type RateComputationStatus = 'DRAFT' | 'COMPUTED' | 'VALIDATED';

export interface RateComputationDto {
  id: number;
  paysId: number;
  periodType: string;
  periodYear: number;
  periodQuarter: number | null;
  periodMonth: number | null;
  computationDate: string | null;
  status: RateComputationStatus;
  hqCostPct: number | null;
  targetMarginPct: number | null;
  productivityRate: number | null;
  workingDaysPerMonth: number | null;
  sellingMonthsPerYear: number | null;
  currency: string | null;
  validatedAt: string | null;
  pushedToPmAt: string | null;
}

export interface CreateRateComputationRequest {
  paysId: number;
  periodType: string;
  periodYear: number;
  periodQuarter?: number | null;
  periodMonth?: number | null;
  hqCostPct?: number | null;
  targetMarginPct?: number | null;
  productivityRate?: number | null;
  workingDaysPerMonth?: number | null;
  sellingMonthsPerYear?: number | null;
  currency?: string | null;
}

export const RATE_COMPUTATION_STATUS_CONFIG: Record<RateComputationStatus, { label: string; bg: string; text: string }> = {
  DRAFT:     { label: 'Brouillon', bg: '#f1f5f9', text: '#475569' },
  COMPUTED:  { label: 'Calculé',   bg: '#dbeafe', text: '#1d4ed8' },
  VALIDATED: { label: 'Validé ✓',  bg: '#d1fae5', text: '#065f46' },
};

// ── Supplier search result (lightweight DTO for form autocomplete) ────────────

export interface SupplierSearchItem {
  id: number;
  name: string;
  code: string | null;
  paysId: number | null;
  /** V102 — STANDARD (HT + taux) or AGENCE_VOYAGE (TTC ligne + base TVA + taux). */
  costCalcProfile?: 'STANDARD' | 'AGENCE_VOYAGE' | null;
}

// ── Supplier "Règlement" ledger (cost-line detail page, Tab 2) ─────────────────

export interface SupplierSummaryDto {
  id: number;
  name: string | null;
  code: string | null;
}

export interface SupplierLedgerRowDto {
  date: string;                 // ISO LocalDate, e.g. "2026-01-10"
  label: string | null;
  debit: number | null;
  credit: number | null;
  soldeDebiteur: number | null;
  soldeCrediteur: number | null;
  /** The paid cost invoice this row comes from (V93 — was a cost line). */
  costInvoiceId: number;
  /** Addresses the règlement this row came from, for Edit/Delete. */
  reglementId: number;
  /** The invoice's own totals — unrelated to the debit/credit/solde reconciliation above. */
  netAmountLocal: number | null;    // Montant HT
  fodecAmount: number | null;
  vatAmountLocal: number | null;    // TVA
  timbreAmount: number | null;
  /** Σ "autres taxes" of the invoice (V95) — included in the TTC. */
  otherTaxesAmount: number | null;
  grossAmountLocal: number | null;  // Montant TTC
  /** Retenue à la source of the invoice — deducted from what is paid. */
  rsAmount: number | null;
}

export interface SupplierLedgerDto {
  supplier: SupplierSummaryDto | null;   // null when the invoice has no supplier attached
  rows: SupplierLedgerRowDto[];
}

export interface CreateReglementRequest {
  montantPaye: number;
  datePaiement: string; // YYYY-MM-DD
  comment?: string | null;
}

export interface UpdateReglementRequest {
  montantPaye: number;
  datePaiement: string; // YYYY-MM-DD
  comment?: string | null;
}

// ── Costs-by-supplier cards ─────────────────────────────────────────────────────

/**
 * `GET /cost-invoices/by-supplier` — one row per distinct supplier for this pays, plus one
 * `supplierId: null` row ("Sans fournisseur") when any invoice has no supplier.
 * Deliberately ALL statuses, not just POSTED like the ledger.
 */
export interface SupplierCostSummaryDto {
  supplierId: number | null;
  supplierName: string | null;
  supplierCode: string | null;
  /** Number of cost invoices (V93 — was the number of cost lines). */
  invoiceCount: number;
  /** Montant HT, EUR. Kept, but not what the card shows — see `totalGrossEur`. */
  totalNetEur: number;
  /**
   * Montant TTC, EUR — what the card displays, matching the TTC the cost-lines table
   * shows per line and the TTC the approval tier resolves from (V82).
   *
   * Reads 0 for lines created before V82 added `gross_amount_eur` (nullable, never
   * backfilled), so a supplier with a real `invoiceCount` and a 0 total means those lines
   * predate the column — a backfill signal, not a bug.
   */
  totalGrossEur: number;
}

// Derive urgency level from the approval level (L1→BASSE, L2→NORMAL, L3/L4→URGENT)
export function getUrgencyFromLevel(level: string | null | undefined): {
  label: string; color: string; bg: string;
} {
  if (!level || level === 'L1') return { label: 'BASSE',  color: '#64748B', bg: '#F1F5F9' };
  if (level === 'L2')           return { label: 'NORMAL', color: '#D97706', bg: '#FFFBEB' };
  return                               { label: 'URGENT', color: '#ba1a1a', bg: '#ffdad6' };
}
