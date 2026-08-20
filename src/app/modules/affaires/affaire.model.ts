export interface PageResponse<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  size: number;
  number: number;
}

export type AffaireStatut = 'EN_COURS' | 'SUSPENDUE' | 'CLOTUREE' | 'ARCHIVEE';
/**
 * `affaires.type_affaire`, as CK_Affaire_Type actually allows it. The old union
 * ('FORFAIT' | 'REGIE' | 'LUMP_SUM') listed two codes the database rejects and omitted the
 * two it uses most — the constraint lives only in the DB, so nothing here ever caught it.
 */
export type AffaireType    = 'LUMP_SUM' | 'MILESTONE' | 'TIME_AND_MATERIALS';
export type TsStatut       = 'CREATED' | 'VALID_TECHNIQUE' | 'VALID_COMMERCIALE' | 'INTEGRE' | 'FACTURE' | 'ANNULE';

/**
 * Ligne de facture vue depuis l'affaire.
 *
 * L'endpoint `/invoices` renvoie déjà `InvoiceResponseDto` en entier : les champs
 * ajoutés ici étaient donc **déjà sur le réseau**, simplement non déclarés, donc
 * invisibles. Ils portent l'essentiel de ce qu'on vient chercher en ouvrant une
 * facture : à qui, sur quelle période, quel HT et quelle TVA, où elle en est de son
 * parcours (soumise → émise → envoyée), et pourquoi s'il y a un avoir ou un litige.
 */
export interface AffaireInvoiceItem {
  id:            number;
  invoiceNumber: string | null;
  invoiceType:   string | null;
  montantTtc:    number | null;
  devise:        string | null;
  statut:        string | null;
  dateEmission:  string | null;
  dateEcheance:  string | null;

  // ── Ajoutés : déjà servis par l'API, jamais affichés ──────────────────────
  clientNom?:          string | null;
  billingMode?:        string | null;
  montantHt?:          number | null;
  montantTva?:         number | null;
  /** Période couverte — porteuse de sens pour une situation ou un acompte. */
  periodFrom?:         string | null;
  periodTo?:           string | null;
  /** Taux d'avancement facturé (mode AV). */
  progressPct?:        number | null;
  submittedAt?:        string | null;
  sentAt?:             string | null;
  /** Renseigné sur un avoir : sans lui, un avoir est un montant négatif sans raison. */
  creditNoteReason?:   string | null;
  linkedInvoiceId?:    number | null;
  disputeOpenedAt?:    string | null;
  disputeResolvedAt?:  string | null;
  notes?:              string | null;
}

// Affaire-scoped payment row (backend PaymentResponseDto).
export interface AffairePaymentItem {
  id:            number;
  invoiceId:     number;
  invoiceNumber: string | null;
  paymentDate:   string | null;
  amountLocal:   number | null;
  currency:      string | null;
  paymentMethod: string | null;
  bankReference: string | null;
  recordedAt:    string | null;
  notes:         string | null;
}

/**
 * Une ligne de `affaire_responsables` — la table qui porte VRAIMENT les responsables
 * d'une affaire.
 *
 * `responsableUserId` / `responsableFullName` sur l'affaire ne désignent que le
 * responsable principal : c'est une colonne de compatibilité que la migration V18
 * remplit par recopie. La liste et la fiche n'affichaient que celle-là, donc un seul
 * nom quel que soit le nombre réel de responsables.
 *
 * Depuis V26 une même personne occupe une ligne PAR ACTIVITÉ : le nombre de lignes
 * n'est donc pas le nombre de personnes — voir `distinctResponsables()`.
 */
export interface AffaireResponsable {
  id:               number;
  userId:           number;
  fullName:         string;
  role:             string | null;
  activiteId:       number | null;
  activiteLabel:    string | null;
  disciplineId:     number | null;
  disciplineLabel:  string | null;
  budgetAllocation: number | null;
  budgetCurrency:   string | null;
}

export interface AffaireListItem {
  id:                 number;
  reference:          string;
  intitule:           string;
  clientId:           number | null;
  clientName:         string | null;
  /** Responsable PRINCIPAL uniquement — la liste complète est dans `responsables`. */
  responsableUserId:  number | null;
  responsableFullName:string | null;
  /** Toujours servi par l'API (liste et fiche) ; optionnel ici pour les fixtures. */
  responsables?:      AffaireResponsable[];
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

/**
 * `GET /affaires/{id}/kpis`. **Aligné champ pour champ sur le record backend**
 * `AffaireKpisDto` — il ne l'était pas : l'interface déclarait `caEncaisse` et
 * `rafDisponible`, deux noms que le backend n'envoie jamais (`ca` et `raf`), donc la
 * tuile « CA encaissé » lisait `undefined` et restait vide en permanence.
 *
 * Trois champs valent 0 en dur côté serveur aujourd'hui, ce n'est pas une donnée
 * manquante mais un calcul non implémenté : `wip`, `coutsInternes` (placeholder
 * timesheet, donc `margeBrute` = ca − sous-traitance) et `tauxAvancement`.
 */
export interface AffaireKpisDto {
  affaireId:                  number;
  reference:                  string;
  /** Encaissé : somme des paiements reçus sur les factures de l'affaire. */
  ca:                         number;
  /** Toujours 0 côté backend. */
  wip:                        number;
  raf:                        number;
  /** Toujours 0 côté backend (placeholder timesheet). */
  coutsInternes:              number;
  coutsExternesSousTraitance: number;
  margeBrute:                 number;
  /** % de `ca`, pas du budget — et 0 dès que `ca` vaut 0. */
  margeBrutePct:              number;
  /** Toujours 0 côté backend. */
  tauxAvancement:             number;
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
  erpReference?:       string | null;
  contractCurrency?:   string | null;
  billingPeriod?:      string | null;
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
  roleName: string | null;
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
  LUMP_SUM:           'Forfaitaire',
  MILESTONE:          'Livrables / Jalons',
  TIME_AND_MATERIALS: 'Régie / Coûts',
};

export const STATUT_LABELS: Record<string, string> = {
  DRAFT:     'AFFAIRES.LIST.TABLE.STATUS.DRAFT',
  EN_COURS:  'AFFAIRES.LIST.TABLE.STATUS.EN_COURS',
  SUSPENDUE: 'AFFAIRES.LIST.TABLE.STATUS.SUSPENDUE',
  CLOTUREE:  'AFFAIRES.LIST.TABLE.STATUS.CLOTUREE',
  ARCHIVEE:  'AFFAIRES.LIST.TABLE.STATUS.ARCHIVEE',
};

export const TS_STATUT_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  CREATED:           { label: 'Créé',           bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  VALID_TECHNIQUE:   { label: 'Validé Tech.',    bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  VALID_COMMERCIALE: { label: 'Validé Comm.',    bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  INTEGRE:           { label: 'Intégré',         bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  FACTURE:           { label: 'Facturé',         bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },
  ANNULE:            { label: 'Annulé',          bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};
