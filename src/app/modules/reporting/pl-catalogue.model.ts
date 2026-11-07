/**
 * P&L source catalogue admin (docs/PL_CATALOGUE_PLAN.md §6 in daf360-facturation-service).
 * Mirrors, field for field, the real backend DTOs in `modules/reporting/dto/*` — do not rename a
 * field without checking the Java record first.
 */

/** The 5 code-defined source types (`PlCatalogueConfigService.VALID_SOURCE_TYPES`) — never
 *  accepted as free text, always one of these five. */
export const PL_CATALOGUE_SOURCE_TYPES = [
  'COST_BOOKED', 'CUSTOMER_BILLED', 'CUSTOMER_OPEN', 'COST_PAYABLE', 'WIP_DECLARATION',
] as const;
export type PlCatalogueSourceType = typeof PL_CATALOGUE_SOURCE_TYPES[number];

export type PlCatalogueConfigStatus = 'DEFAULT' | 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

export interface PlCatalogueStatusEntryDto {
  status: string;
  selected: boolean;
  neverSelectable: boolean;
}

export interface PlCatalogueStatusConfigDto {
  paysId: number | null;
  sourceType: PlCatalogueSourceType;
  version: number | null;
  configStatus: PlCatalogueConfigStatus;
  entries: PlCatalogueStatusEntryDto[];
}

export interface SaveStatusConfigRequest {
  paysId: number | null;
  sourceType: PlCatalogueSourceType;
  selectedStatuses: string[];
}

export type PlCategoryMappingRole = 'COST' | 'EXTERNAL_COGS' | 'MANUAL' | 'EXCLUDED';

export interface PlCategoryLineMappingEntryDto {
  categoryCode: string;
  catalogueLineId: number;
  catalogueLineCode: string | null;
  mappingRole: PlCategoryMappingRole;
}

export interface PlCategoryLineMappingDto {
  paysId: number | null;
  version: number | null;
  configStatus: PlCatalogueConfigStatus;
  entries: PlCategoryLineMappingEntryDto[];
}

export interface SaveCategoryMappingRequestEntry {
  categoryCode: string;
  catalogueLineId: number;
  mappingRole: PlCategoryMappingRole;
}

export interface SaveCategoryMappingRequest {
  paysId: number | null;
  entries: SaveCategoryMappingRequestEntry[];
}

export interface CoverageCheckResultDto {
  ok: boolean;
  unmappedCategoryCodes: string[];
  duplicatedCategoryCodes: string[];
}
