// Field-for-field match of the new TsProgressBillingController DTOs — mirrors
// ../wip/wip.model.ts's WipTauxDto exactly, scoped by tsId instead of affaireId.

export type TsTauxStatut = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE';

export interface TsTauxDto {
  id: number;
  tsId: number;
  periodDateFrom: string;
  periodDateTo: string;
  tauxPrecedent: number;
  tauxSaisi: number;
  montantIncremental: number;
  commentaire: string | null;
  statut: TsTauxStatut;
  submittedBy: number;
  submittedAt: string;
  validatedBy: number | null;
  validatedAt: string | null;
  motifRefus: string | null;
  billingLineId: number | null;
}

/** One row of the TS WIP tab's selector list — every INTEGRE/FACTURE TS of the affaire, with
 * its cumulative declared progress. Mirrors the backend's TsProgressSummaryDto. */
export interface TsProgressSummaryDto {
  tsId: number;
  referenceTs: string;
  intitule: string;
  montantEstime: number;
  devise: string;
  statut: 'INTEGRE' | 'FACTURE';
  cumulTauxValide: number;
  cumulMontantValide: number;
  remainingMontant: number;
}
