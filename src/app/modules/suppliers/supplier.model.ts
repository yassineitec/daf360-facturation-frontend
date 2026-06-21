import type { PageResponse } from '../affaires/affaire.model';
export type { PageResponse };

// Matches backend SupplierDto record — field names are English (not French)
export interface SupplierDto {
  id: number;
  name: string;
  supplierCode: string | null;
  code: string | null;         // generated code e.g. "FR-0001"
  paysId: number | null;
  paysCode: string | null;
  paysLabel: string | null;
  isActive: boolean;
  numeroTva: string | null;
  ibanMasked: string | null;   // always masked — never raw IBAN from list
  tvaUniqueActive?: boolean | null;
  notes?: string | null;
}

export interface SupplierStatsDto {
  total: number;
  active: number;
  pendingValidation: number;
}

export interface CreateSupplierRequest {
  paysId: number;
  name: string;
  paysCode: string;
  paysLabel?: string;
  numeroTva?: string;
  iban?: string;
  tvaUniqueActive?: boolean;
  notes?: string;
}
