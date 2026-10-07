// Field-for-field match of the REAL backend DTOs (ProgressBillingService.toDto() /
// WipTmPreviewDto / WipTmHourDto) — NOT a naive reuse of the old progress-billing taux DTO
// (since removed), whose field names didn't match what the server actually sends.

export type WipTauxStatut = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE';

export interface WipTauxDto {
  id: number;
  affaireId: number;
  periodDateFrom: string;
  periodDateTo: string;
  tauxPrecedent: number;
  tauxSaisi: number;
  montantIncremental: number;
  commentaire: string | null;
  statut: WipTauxStatut;
  submittedBy: number;
  submittedAt: string;
  validatedBy: number | null;
  validatedAt: string | null;
  motifRefus: string | null;
  billingLineId: number | null;
}

export interface WipTmHourDto {
  userId: number;
  userFullName: string;
  workDate: string;
  disciplineLabel: string | null;
  wbsId: string | null;
  wbsName: string | null;
  document: string | null;
  hoursValidated: number;
  costAmount: number;
  rateAmount: number;
}

export interface WipTmPreviewDto {
  totalCost: number;
  totalSell: number;
  hours: WipTmHourDto[];
  /** Unapproved remainder from a prior period, not folded into totalSell/totalCost — the
   * client-approval workflow displays it separately (see AFFAIRES.WIP.CARRIED_FORWARD_*). */
  carriedForwardAmount: number;
  carriedForwardFromLineId: number | null;
}

/** Matches the backend's EmailPreviewDto record exactly (ProgressBillingService/WipTmService/
 * LivrableBillingService's previewXxxEmail() methods) — the exact subject/body a submit action
 * would send to the client, computed read-only so the WIP tab can show it in a
 * review-and-confirm popup before the user triggers the real submit. */
export interface EmailPreviewDto {
  subject: string;
  body: string;
}
