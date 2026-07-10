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
  extWbsId: string;
  documentNom: string;
  wbsTitre?: string;
  budgetHoraireExt?: number;
  budget: number;
}

export interface AffaireLivrableDto {
  id: number;
  extDocumentId: string;
  documentNom: string;
  extWbsId: string;
  wbsTitre?: string;
  disciplineLabel: string;
  budgetHoraireExt?: number;
  budgetAlloue: number;
  modeAffectation: 'MANUEL' | 'AUTO';
  statut: 'A_FACTURER' | 'EN_COURS' | 'FACTURE' | 'ANNULE';
  ordre: number;
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
  sourceCalcul: 'COST_LINES' | 'DEFAUT_TAUX';
}
