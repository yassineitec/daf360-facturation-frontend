export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export type AffaireStatut = 'EN_COURS' | 'SUSPENDUE' | 'CLOTUREE' | 'ARCHIVEE';
export type AffaireType    = 'FORFAIT' | 'REGIE' | 'LUMP_SUM';
export type TsStatut       = 'CREATED' | 'VALID_TECHNIQUE' | 'VALID_COMMERCIALE' | 'INTEGRE' | 'FACTURE' | 'ANNULE';

export interface AffaireListItem {
  id:                 number;
  reference:          string;
  intitule:           string;
  clientId:           number | null;
  clientName:         string | null;
  responsableUserId:  number | null;
  responsableFullName:string | null;
  typeAffaire:        AffaireType | string;
  statut:             AffaireStatut | string;
  budgetPrevisionnel: number | null;
  budgetValide:       boolean;
  rafDisponible?:     number | null;
  rafAlerteSeuilPct:  number;
  paysId:             number;
  devise?:            string;
  billingMode?:       string | null;
  dateDebut:          string | null;
  dateFin:            string | null;
}

export interface AffaireDetail extends AffaireListItem {
  notes:             string | null;
  doc360Ref:         string | null;
  erpReference?:     string | null;
  devise:            string;
  rafAlerteSent:     boolean;
  createdAt:         string;
  updatedAt:         string | null;
  billingModeLocked?:boolean;
  contractAmount?:   number | null;
  cpMarginRatePct?:  number | null;
}

export interface RafDetailsDto {
  affaireId:          number;
  reference:          string;
  budgetPrevisionnel: number;
  budgetValide:       boolean;
  montantTsIntegres:  number;
  totalFacturesEmises:number;
  rafDisponible:      number;
  rafPourcentage:     number;
  alerteActive:       boolean;
}

export interface AffaireKpisDto {
  caEncaisse:   number;
  rafDisponible:number;
  wip:          number;
  margeBrutePct:number;
}

export interface TsDto {
  id:                  number;
  referenceTs:         string;
  affaireId:           number;
  intitule:            string;
  montantEstime:       number;
  devise:              string;
  perimetre:           string | null;
  description:         string | null;
  impactBudgetaire:    string | null;
  statut:              TsStatut | string;
  validTechniqueNotes: string | null;
  validCommercialeNotes: string | null;
  validTechniqueAt:    string | null;
  validCommercialeAt:  string | null;
  integreAuBudgetAt:   string | null;
  createdAt:           string;
}

export interface CreateAffaireRequest {
  reference?:          string | null;
  intitule:            string;
  clientId:            number;
  responsableUserId?:  number | null;
  typeAffaire?:        string | null;
  dateDebut?:          string | null;
  dateFin?:            string | null;
  budgetPrevisionnel?: number | null;
  paysId:              number;
  notes?:              string | null;
  doc360Ref?:          string | null;
}

export type UpdateAffaireRequest = CreateAffaireRequest;

export interface ChangerStatutRequest {
  newStatut: string;
  reason?: string | null;
}

export interface CreateTsRequest {
  intitule:          string;
  montantEstime:     number;
  devise?:           string;
  perimetre?:        string | null;
  description?:      string | null;
  impactBudgetaire?: string | null;
}

export interface ValiderTsRequest {
  notes?: string | null;
}

export interface AffaireFilter {
  paysId?:   number | null;
  statut?:   string | null;
  type?:     string | null;
  clientId?: number | null;
  search?:   string | null;
  page?:     number;
  size?:     number;
}

export interface ClientDto {
  id:              number;
  clientName:      string;
  clientCode:      string | null;
  isKycDone:       boolean;
  defaultCurrency: string | null;
}

export interface UserRefDto {
  id:       number;
  fullName: string;
  email:    string;
  paysId:   number;
}

export interface PaysRefDto {
  id:           number;
  isoCode:      string;
  frenchLabel:  string;
}

export const STATUT_TRANSITIONS: Record<string, string[]> = {
  EN_COURS:  ['SUSPENDUE', 'CLOTUREE'],
  SUSPENDUE: ['EN_COURS',  'CLOTUREE'],
  CLOTUREE:  ['ARCHIVEE'],
  ARCHIVEE:  [],
};

export const TYPE_LABELS: Record<string, string> = {
  FORFAIT:  'Forfait',
  REGIE:    'Régie',
  LUMP_SUM: 'Lump Sum',
};

export const STATUT_LABELS: Record<string, string> = {
  EN_COURS:  'En cours',
  SUSPENDUE: 'Suspendue',
  CLOTUREE:  'Clôturée',
  ARCHIVEE:  'Archivée',
};

export const TS_STATUT_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CREATED:           { label: 'Créé',           bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  VALID_TECHNIQUE:   { label: 'Validé Tech.',    bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  VALID_COMMERCIALE: { label: 'Validé Comm.',    bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  INTEGRE:           { label: 'Intégré',         bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  FACTURE:           { label: 'Facturé',         bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },
  ANNULE:            { label: 'Annulé',          bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};
