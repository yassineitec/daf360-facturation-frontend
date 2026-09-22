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
  /** Somme des factures émises (hors annulées/brouillons/retournées). */
  montantFacture?:    number | null;
  /** Pas encore un vrai calcul côté serveur — même placeholder que `AffaireKpisDto.wip`. */
  wip?:               number | null;
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
 * Deux champs valent 0 en dur côté serveur aujourd'hui, ce n'est pas une donnée
 * manquante mais un calcul non implémenté : `coutsInternes` (placeholder timesheet,
 * donc `margeBrute` = ca − sous-traitance) et `tauxAvancement`.
 */
export interface AffaireKpisDto {
  affaireId:                  number;
  reference:                  string;
  /** Encaissé : somme des paiements reçus sur les factures de l'affaire. */
  ca:                         number;
  /** `somme des WIP déclarés (tous statuts) − totalFacture` : le constaté pas encore passé
   *  en facture. Négatif quand on a facturé plus que ce que l'onglet WIP a déclaré.
   *  0 hors Forfait/Régie/Livrable. */
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
  /** Budget prévisionnel − `totalFacture` : le reste du contrat à facturer. Négatif =
   *  budget dépassé. */
  backlog:                    number;
  /** Somme des factures dont le statut n'est pas `PAID` — le facturé non encore soldé.
   *  Le « facturé » de référence : `backlog` et `wip` se calculent dessus. */
  totalFacture:               number;
  /** Somme des factures au statut `PAID` — la tuile « Total encaissé ». À ne pas confondre
   *  avec `ca` (somme des règlements reçus), qui alimente la marge et la jauge « Santé du
   *  projet » : les deux divergent dès qu'une facture est partiellement réglée. */
  totalEncaisse:              number;
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

// Correspond exactement à UpdateAffaireRequest.java côté backend (PATCH
// /affaires/{id}) — pas de reference/paysId/typeAffaire, cette route ne les
// accepte pas. Aucun appelant frontend actif aujourd'hui (le seul qui existait,
// affaire-form.component.ts, était l'écran de création legacy — supprimé), gardé
// pour que affaire.service.ts#updateAffaire reste type-correct si/quand un appelant
// réapparaît.
export interface UpdateAffaireRequest {
  intitule?:           string | null;
  clientId?:           number | null;
  responsableUserId?:  number | null;
  dateDebut?:          string | null;
  dateFin?:            string | null;
  budgetPrevisionnel?: number | null;
  rafAlerteSeuilPct?:  number | null;
  notes?:              string | null;
  doc360Ref?:          string | null;
  erpReference?:       string | null;
  contractCurrency?:   string | null;
  billingPeriod?:      string | null;
}

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

/**
 * Agrégats des tuiles, calculés côté serveur sur TOUT le jeu filtré.
 * Ils ne se déduisent pas de la page reçue : `GET /affaires` n'en renvoie que 20 lignes.
 */
export interface AffairesSummary {
  total:       number;
  actives:     number;
  suspendues:  number;
  budgetTotal: number;
  rafTotal:    number;
  /** Devise des deux montants : toujours 'EUR', converti côté serveur. */
  devise:      string;
  /** Devises écartées faute de taux `RATE_EUR_*` — leurs montants ne sont dans aucun total. */
  devisesIgnorees: string[];
}

export interface AffaireFilter {
  paysId?:   number | null;
  statut?:   string | null;
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

export interface TmWorkedHoursLine {
  collaboratorId:       number;
  collaboratorFullName: string;
  // Ces trois champs sont réellement nullable côté API — confirmé par appel live le
  // 2026-08-19 (ex: wbsId=null pour la majorité des documents réels d'une affaire réelle).
  // Précédemment typés comme des string non-nullable, ce qui masquait un vrai risque
  // d'interpolation de "null" littéral dans les descriptions générées côté UI.
  document:             string | null;
  wbsId:                string | null;
  wbsName:              string | null;
  totalHours:           number;
}

export interface AffaireRessourceRef {
  userId:       number;
  rateType:     string;
  rateAmount:   number;
  rateCurrency: string;
}

/** Richer than AffaireRessourceRef (name/email/active/lock status) — feeds the affaire
 * detail page's "Ressources" management tab. */
export interface AffaireRessourceManageDto {
  id:           number;
  userId:       number;
  userFullName: string | null;
  userEmail:    string | null;
  rateAmount:   number;
  rateCurrency: string | null;
  rateType:     string | null;
  isActive:     boolean;
  rateLocked:   boolean | null;
}

export interface AddAffaireRessourceRequest {
  userId:       number;
  rateAmount:   number;
  rateCurrency?: string | null;
  rateType?:    string | null;
}

export interface UpdateResourceRateRequest {
  newRate:      number;
  rateCurrency?: string | null;
}

/** One real Timesheet collaborator with hours on this affaire — feeds the Ressources
 * tab's "add" flow so a manager picks from people who actually worked here. */
export interface AffaireWorkedHoursSummaryDto {
  email:        string;
  fullName:     string | null;
  userId:       number | null;
  totalHours:   number;
  isRessource:  boolean;
}

export interface PaysRefDto {
  id:           number;
  isoCode:      string;
  frenchLabel:  string;
}

/**
 * Les statuts d'affaire, dans l'ordre du cycle de vie — et c'est un ordre d'AFFICHAGE, pas
 * une contrainte : depuis la décision du 2026-09-17, la fiche affaire permet d'aller de
 * n'importe quel statut vers n'importe quel autre.
 *
 * <p>Le graphe de transitions qui vivait ici (EN_COURS → SUSPENDUE|CLOTUREE, CLOTUREE →
 * ARCHIVEE seulement) n'avait aucune porte de sortie : une affaire archivée par erreur, ou
 * clôturée trop tôt, ne pouvait plus jamais revenir en arrière et il fallait une écriture
 * en base pour la rattraper.
 *
 * <p>La même liste est répliquée côté serveur (`AffaireService.AFFAIRE_STATUTS`) : ce que
 * cet écran propose et ce que le serveur accepte doivent rester la même chose. Elle doit
 * aussi rester alignée sur la contrainte `CK_Affaire_Statut` (V22), qui refuse tout
 * statut hors de ces six valeurs.
 */
export const AFFAIRE_STATUTS: string[] = [
  'DRAFT', 'CONFIGURED', 'EN_COURS', 'SUSPENDUE', 'CLOTUREE', 'ARCHIVEE',
];

export const TYPE_LABELS: Record<string, string> = {
  LUMP_SUM:           'Forfaitaire',
  MILESTONE:          'Livrables / Jalons',
  TIME_AND_MATERIALS: 'Régie / Coûts',
};

export const STATUT_LABELS: Record<string, string> = {
  DRAFT:     'AFFAIRES.LIST.TABLE.STATUS.DRAFT',
  CONFIGURED:'AFFAIRES.LIST.TABLE.STATUS.CONFIGURED',
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
