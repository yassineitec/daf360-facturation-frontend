// ─── DB externe (lecture seule depuis ODS) ────────────────────────────────────

export interface DisciplineExtDto {
  id: string;           // ID_Discipline (nvarchar)
  label: string;        // Discipline
  montant?: number;     // MontantDiscipline
  paysId?: string;      // FK_ID_PAYS
}

export interface WbsExtDto {
  id: string;           // PK_ID_WBS
  subWbs?: string;      // Sub_WBS
  titre: string;        // Titre_WBS
  idSubWbs?: number;
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
 * LivrableService.validateLivrables() sends, one entry per document actually changed. */
export interface LivrableTauxEntry {
  livrableId: number;
  pctSaisi: number;
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
