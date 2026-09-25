// ─── DB externe (lecture seule depuis ODS) ────────────────────────────────────

export interface DisciplineExtDto {
  id: string;           // ID_Discipline (nvarchar)
  label: string;        // Discipline
  montant?: number;     // MontantDiscipline
  paysId?: string;      // FK_ID_PAYS
  documentCount: number; // documents across all its WBS — 0 → disabled in the wizard
}

export interface WbsExtDto {
  id: string;           // PK_ID_WBS
  subWbs?: string;      // Sub_WBS
  titre: string;        // Titre_WBS
  idSubWbs?: number;
  documentCount: number; // 0 → disabled in the wizard
}

export interface DocumentExtDto {
  id: string;           // ID_DOCUMENT
  nom: string;          // NOM_DOCUMENT
  budgetHoraire?: number; // BUDGET_HORAIRE
  statut?: string;      // SATUT_ACTUEL
  activityId?: string;  // ACTIVITY_ID
  wbsId?: string;
  wbsTitre?: string;
}

// ─── Affectation ──────────────────────────────────────────────────────────────

export interface AffectationManuelleItem {
  extDocumentId: string;
  documentNom: string;
  wbsTitre?: string;
  budgetHoraireExt?: number;
  budget: number;
}

export interface AffaireLivrableDto {
  id: number;
  extDocumentId: string;
  documentNom: string;
  wbsTitre?: string;
  disciplineLabel: string;
  budgetHoraireExt?: number;
  budgetAlloue: number;
  /** Cumulative percentage already invoiced for this document — same mental model as
   * Forfaitaire's taux d'avancement, scoped to one document. */
  pctFacture: number;
  modeAffectation: 'MANUEL' | 'AUTO';
  statut: 'A_FACTURER' | 'EN_COURS' | 'FACTURE' | 'ANNULE';
  ordre: number;
}

/** One document's newly-entered cumulative percentage — the request shape
 * LivrableService.submitLivrables()/editBatch() send, one entry per document actually changed. */
export interface LivrableTauxEntry {
  livrableId: number;
  pctSaisi: number;
}

/** One document's line within a LIVRABLE batch — mirrors the backend's LivrableBatchEntryDto. */
export interface LivrableBatchEntryDto {
  billingLineId: number;
  livrableId:    number;
  documentNom:   string | null;
  pctPrecedent:  number;
  pctSaisi:      number;
  montantHt:     number;
}

export type LivrableBatchStatut =
  'EN_ATTENTE_CLIENT' | 'EN_ATTENTE_DF' | 'FACTURE' | 'A_VERIFIER' | 'RETOURNE' | 'ANNULE';

/** One or more documents submitted together, sharing one client confirmation and one DF
 * decision — mirrors the backend's LivrableBatchDto field-for-field. */
export interface LivrableBatchDto {
  batchId:              number;
  affaireId:            number;
  statut:               LivrableBatchStatut;
  combinedMontant:      number;
  clientApprovedAmount: number | null;
  wipCarriedForward:    number | null;
  invoiceId:            number | null;
  billingDate:          string;
  entries:              LivrableBatchEntryDto[];
}

// ─── TM taux ──────────────────────────────────────────────────────────────────

export interface CollaborateurTauxDto {
  userId: number;
  fullName: string;
  coutReel: number;
  tauxIntercompany: number;
  tauxVente: number;
  pctHqCost: number;
  pctMargin: number;
  sourceCalcul: 'EMPLOYEE_COSTS' | 'AUCUNE_DONNEE';
}
