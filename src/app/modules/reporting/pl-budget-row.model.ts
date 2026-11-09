import type { PlCatalogueConfigStatus } from './pl-catalogue.model';

/**
 * Budget EUR/CHF sheet's line registry and mapping (docs/superpowers/specs/2026-11-09-pl-sheet-line-config-design.md).
 * Mirrors, field for field, the real backend DTOs in
 * daf360-facturation-service's `modules/reporting/dto/PlBudgetRow*`/`SaveBudgetRowMappingRequest`/
 * `BudgetRowCoverageCheckResultDto`. Deliberately has NO `paysId` field anywhere, unlike
 * `pl-catalogue.model.ts`'s category-mapping types -- Budget's row assignment is global.
 */

export type PlBudgetRowTransform = 'DIRECT' | 'NEGATE' | 'POSITIVE_PART' | 'NEGATIVE_PART';

export interface PlBudgetRowDto {
  id: number;
  code: string;
  labelFr: string;
  labelEn: string;
  excelRow: string;
  sortOrder: number;
}

export interface PlBudgetRowMappingEntryDto {
  budgetRowId: number;
  budgetRowCode: string | null;
  catalogueLineId: number;
  catalogueLineCode: string | null;
  transform: PlBudgetRowTransform;
}

export interface PlBudgetRowMappingDto {
  version: number | null;
  configStatus: PlCatalogueConfigStatus;
  entries: PlBudgetRowMappingEntryDto[];
}

export interface SaveBudgetRowMappingRequestEntry {
  budgetRowId: number;
  catalogueLineId: number;
  transform: PlBudgetRowTransform;
}

export interface SaveBudgetRowMappingRequest {
  entries: SaveBudgetRowMappingRequestEntry[];
}

export interface BudgetRowCoverageCheckResultDto {
  ok: boolean;
  unmappedBudgetRowCodes: string[];
}
