export interface SousTraitantDto {
  id: number;
  paysId: number;
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  taxId: string | null;
  country: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface OSTDto {
  id: number;
  affaireId: number;
  sousTraitantId: number;
  sousTraitantName: string;
  referenceOst: string;
  perimetre: string;
  montantBudget: number;
  montantRealise: number;
  devise: string;
  statut: 'EN_COURS' | 'SUSPENDU' | 'CLOTURE';
  alerteDepassementPct: number;
  createdBy: number;
  createdAt: string;
}

export interface CoutSTDto {
  id: number;
  ordreId: number;
  dateCout: string;
  montant: number;
  devise: string;
  justificatifUrl: string | null;
  description: string | null;
  saisiePar: number;
  saisieAt: string;
}

export interface MarginDto {
  affaireId: number;
  reference: string;
  ca: number;
  coutsInternes: number;
  coutsST: number;
  margeBrute: number;
  margeBrutePct: number;
}

export interface CreateSousTraitantRequest {
  paysId: number;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxId?: string | null;
  country?: string | null;
}

export interface CreateOSTRequest {
  sousTraitantId: number;
  perimetre: string;
  montantBudget: number;
  devise?: string | null;
  alerteDepassementPct?: number | null;
}

export interface CreateCoutSTRequest {
  montant: number;
  dateCout: string;
  devise?: string | null;
  justificatifUrl?: string | null;
  description?: string | null;
}

export const OST_STATUT_LABELS: Record<string, string> = {
  EN_COURS: 'En cours',
  SUSPENDU: 'Suspendu',
  CLOTURE:  'Clôturé',
};

export const OST_VALID_TRANSITIONS: Record<string, string[]> = {
  EN_COURS: ['CLOTURE', 'SUSPENDU'],
  SUSPENDU: ['EN_COURS', 'CLOTURE'],
  CLOTURE:  [],
};

export function ostBudgetPct(ost: OSTDto): number {
  if (!ost.montantBudget) return 0;
  return Math.min(100, (ost.montantRealise / ost.montantBudget) * 100);
}

export function ostIsOver(ost: OSTDto): boolean {
  if (!ost.montantBudget || ost.alerteDepassementPct == null) return false;
  return ost.montantRealise > ost.montantBudget * (1 + ost.alerteDepassementPct / 100);
}

export function fmtAmt(v: number | null, devise = 'TND'): string {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  } catch {
    return `${v} ${devise}`;
  }
}
