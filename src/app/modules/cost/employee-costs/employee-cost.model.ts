export interface EmployeeCostDto {
  id: number;
  employeeEmail: string;
  userRefId: number | null;
  fullName: string | null;
  basicCost: number;
  internalSellingCost: number;
  externalSellingCost: number;
  currency: string;
  dateDebut: string;
  dateFin: string;
  sourceStatus: 'Current' | 'Expired' | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface CreateEmployeeCostRequest {
  employeeEmail: string;
  basicCost: number;
  currency: string;
  dateDebut: string;
  dateFin: string;
}

export interface UpdateEmployeeCostRequest {
  basicCost: number;
  currency: string;
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

/** Le coût le plus récent (date de début la plus tardive) d'un collaborateur, ou null s'il
 * n'en a aucun — même ordre que le backend pour décider du statut « Current »
 * (EmployeeCostService.normalizeStatuses). Email comparé sans la casse. */
export function latestCostFor(rows: EmployeeCostDto[], email: string): EmployeeCostDto | null {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  return rows
    .filter(r => r.employeeEmail.toLowerCase() === target)
    .reduce<EmployeeCostDto | null>(
      (best, r) => !best || r.dateDebut > best.dateDebut || (r.dateDebut === best.dateDebut && r.id > best.id) ? r : best,
      null,
    );
}

/** Période proposée pour un nouveau coût qui suit un coût se terminant le `previousDateFin`
 * (ISO yyyy-MM-dd) : du lendemain au 31/12 de l'année de ce lendemain — la convention
 * annuelle déjà utilisée par les valeurs par défaut du formulaire. Calcul en UTC pour
 * qu'aucun fuseau horaire ne décale le jour. */
export function nextPeriodAfter(previousDateFin: string): { dateDebut: string; dateFin: string } {
  const [y, m, d] = previousDateFin.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const year = next.getUTCFullYear();
  const dateDebut = `${year}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
  return { dateDebut, dateFin: `${year}-12-31` };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
