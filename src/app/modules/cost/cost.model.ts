import type { PageResponse } from '../affaires/affaire.model';
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
}

export interface ListTypeDto {
  id: number;
  code: string;
  labelFr: string;
  labelEn: string | null;
  isGlobal: boolean;
  isActive: boolean;
}

// ── Cost category (matches backend CostCategoryDto record exactly) ─────────────

export interface CostCategoryDto {
  id: number;
  paysId: number;
  code: string;
  labelFr: string;
  labelEn: string | null;
  categoryNumber: number;
  isCapex: boolean | null;
  isOverhead: boolean | null;
  isDirect: boolean | null;
  parentId: number | null;
  isActive: boolean;
  budgetAllocationPct: number | null;
  requiresSupplier: boolean | null;
  requiresDocument: boolean | null;
  approvalRequiredFromAmount: number | null;
  displayOrder: number | null;
  // V14 fields
  sourceType: string | null;           // 'MANUAL' | 'AUTO_PUSH'
  autoPushModule: string | null;       // 'LEASE' | 'IT_ASSET' | 'SUBCONTRACT' | 'MAINTENANCE'
  isStrictScrutiny: boolean | null;
  descriptionFr: string | null;
  descriptionEn: string | null;
}

export interface UpdateCostCategoryLabelRequest {
  labelFr?: string;
  labelEn?: string;
  descriptionFr?: string;
  descriptionEn?: string;
}

/** Categories whose lines are auto-pushed from external modules — manual entry blocked. */
const AUTO_PUSH_CATEGORY_NUMBERS = new Set([2, 3, 8, 11]);

export function isManualSource(cat: CostCategoryDto): boolean {
  return !AUTO_PUSH_CATEGORY_NUMBERS.has(cat.categoryNumber);
}

export function isCategoryStrictScrutiny(cat: CostCategoryDto): boolean {
  return cat.categoryNumber === 12;
}

// ── Approval threshold (matches backend CostApprovalThresholdDto) ─────────────

export interface CostApprovalThresholdDto {
  id: number;
  paysId: number;
  categoryId: number | null;
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
  categoryId: number | null;
  label: string | null;           // backend field name is "label"
  originModule: string | null;
  originReferenceId: string | null;
  profileUserId: number | null;
  projectId: string | null;
  affaireId: number | null;
  supplierId: number | null;
  supplierNameFree: string | null;
  netAmountLocal: number | null;
  vatAmountLocal: number | null;
  grossAmountLocal: number | null;
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
  approvals: CostApprovalRecordDto[];
  dualApprovalDone: boolean | null;
}

// ── Create/update request (matches backend CreateCostLineRequest record) ────────

export interface CreateCostLineRequest {
  paysId: number;
  categoryId: number;
  transactionDate: string;   // YYYY-MM-DD
  periodYear: number;
  periodMonth: number;
  description: string;       // backend maps this to CostLine.label
  netAmountLocal: number;
  vatAmountLocal?: number | null;
  currencyId: number;
  supplierId?: number | null;
  supplierNameFree?: string | null;
  documentUrl?: string | null;
  notes?: string | null;
  isRecurring?: boolean | null;
  recurrenceFrequencyId?: number | null;
  costTypeId?: number | null;
  paymentMethodId?: number | null;
  affaireId?: number | null;
}

// ── Import result ──────────────────────────────────────────────────────────────

export interface CostImportResult {
  totalRows: number;
  successCount: number;
  errorCount: number;
  errors: CostImportError[];
}

export interface CostImportError {
  row: number;
  message: string;
}

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
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAmount(amount: number | null, currency = 'EUR'): string {
  if (amount == null) return '—';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `${amount.toFixed(0)} ${currency}`;
  }
}
