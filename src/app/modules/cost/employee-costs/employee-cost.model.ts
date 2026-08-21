export interface EmployeeCostDto {
  id: number;
  employeeEmail: string;
  userRefId: number | null;
  fullName: string | null;
  basicCost: number;
  internalSellingCost: number;
  externalSellingCost: number;
  dateDebut: string;
  dateFin: string;
  sourceStatus: 'Current' | 'Expired' | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateEmployeeCostRequest {
  employeeEmail: string;
  basicCost: number;
  dateDebut: string;
  dateFin: string;
}

export interface UpdateEmployeeCostRequest {
  basicCost: number;
  dateDebut: string;
  dateFin: string;
}

export interface ManualEmployeeCostEntryRequest {
  employeeEmail: string;
  basicCost: number;
}

export const INTERNAL_MARKUP = 1.1;
export const EXTERNAL_MARKUP = 1.2;

export type EmployeeCostDriverField = 'basic' | 'internal' | 'external';

export interface DerivedEmployeeCostFields {
  basicCost: number;
  internalSellingCost: number;
  externalSellingCost: number;
}

/** The one place the fixed 1.1 / 1.2 markup formula lives on the frontend — used both by
 * the admin EmployeeCostComponent (one-editable-field-drives-the-rest behavior) and by
 * wizard-step-tm.component.ts's write-back path for collaborators with no cost data yet. */
export function deriveEmployeeCostFields(
  driver: EmployeeCostDriverField,
  value: number,
): DerivedEmployeeCostFields {
  const unroundedBasicCost =
    driver === 'basic' ? value :
    driver === 'internal' ? value / INTERNAL_MARKUP :
    value / EXTERNAL_MARKUP;

  const basicCost = round2(unroundedBasicCost);

  return {
    basicCost,
    internalSellingCost: round2(basicCost * INTERNAL_MARKUP),
    externalSellingCost: round2(basicCost * EXTERNAL_MARKUP),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
