import { currencyFractionDigits } from '../../shared/currency-decimals.util';

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
  /** Fournisseur associé (V145), facultatif. */
  supplierId: number | null;
  supplierName: string | null;
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
  // Currency-safe conversions to the parent affaire's own currency — for cross-OST KPI
  // sums, since each OST can carry its own `devise`.
  montantBudgetAffaireCcy: number;
  montantRealiseAffaireCcy: number;
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
  /** Facture fournisseur dont le coût est issu (V145) — null pour un coût saisi à la main. */
  costInvoiceId: number | null;
  costInvoiceReference: string | null;
}

/** Facture fournisseur rattachable à un OST. */
export interface LinkableCostInvoiceDto {
  id: number;
  reference: string;
  supplierId: number | null;
  supplierName: string | null;
  supplierInvoiceNumber: string | null;
  invoiceDate: string;
  netAmount: number;
  currency: string;
  status: string;
  matchesSupplier: boolean;
}

/** Le coût ST issu d'une facture fournisseur, vu depuis la facture. */
export interface CostInvoiceOstLinkDto {
  coutId: number;
  ordreId: number;
  referenceOst: string;
  ostStatut: string;
  affaireId: number;
  affaireReference: string;
  affaireIntitule: string | null;
  sousTraitantName: string | null;
  montant: number;
  devise: string;
  dateCout: string;
}

/** OST en cours auquel une facture fournisseur peut être imputée. */
export interface OstCandidateDto {
  ordreId: number;
  referenceOst: string;
  perimetre: string | null;
  affaireId: number;
  affaireReference: string;
  affaireIntitule: string | null;
  sousTraitantName: string | null;
  matchesSupplier: boolean;
}

/** Statuts de facture fournisseur qu'on ne rattache pas (miroir du serveur). */
export const NOT_LINKABLE_INVOICE_STATUSES = ['DRAFT', 'RETURNED', 'REJECTED'];

export interface MarginDto {
  affaireId: number;
  reference: string;
  /** HT des factures émises — la base de la marge. */
  facture: number;
  /** Paiements reçus, pour information. */
  encaisse: number;
  /** Heures Timesheet × coût de base, converties dans `currency`. */
  coutsInternes: number;
  heuresInternes: number;
  /** Heures sans coût enregistré, comptées à 0 dans `coutsInternes`. */
  heuresNonValorisees: number;
  coutsST: number;
  margeBrute: number;
  margeBrutePct: number | null;
  currency: string;
}

export interface CreateSousTraitantRequest {
  paysId: number;
  name: string;
  contactEmail?: string | null;
  contactPhone?: string | null;
  taxId?: string | null;
  country?: string | null;
  /** Fournisseur associé ; sur une mise à jour, null le détache. */
  supplierId?: number | null;
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

export function fmtAmt(v: number | null, devise = 'EUR'): string {
  if (v == null) return '—';
  try {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
    }).format(v);
  } catch {
    const digits = currencyFractionDigits(devise);
    return `${v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${devise}`;
  }
}
