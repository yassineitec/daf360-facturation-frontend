/**
 * Contrat de `GET /api/fact/treasury/summary`, aligné champ pour champ sur
 * `TreasurySummaryDto`.
 *
 * Trois points de vocabulaire qui portent tout l'écran :
 *
 * - **tout est net**. Une créance compte pour son reste dû (total − règlements clients),
 *   un engagement pour son reste à payer (total − règlements fournisseurs). Les deux
 *   côtés suivent la même règle, sans quoi ils ne se comparent pas.
 * - **engagement** ≠ **décaissement confirmé**. Une ligne de coût approuvée est une
 *   dépense due ; qu'elle soit réglée ne se sait que si quelqu'un a saisi le règlement.
 *   Le backend ne reprend donc les échéances passées que sur `lookbackJours`.
 * - **les avoirs ne sont pas projetés.** Un remboursement dû à un client est un
 *   décaissement au montant négatif ; il est exclu plutôt que compté à l'envers.
 *
 * Les **jalons** ont été retirés : plus aucune date de facturation planifiée n'existe
 * dans le modèle depuis V46, et les champs valaient zéro depuis leur création.
 *
 * Et surtout : `cumule` est une **variation** de trésorerie partant de zéro, pas un solde.
 * Le modèle facturation ne porte aucune position bancaire d'ouverture.
 */

/** Le seau de tête, qui agrège tout ce qui est déjà échu plutôt qu'un mois calendaire. */
export const OVERDUE_KEY = 'OVERDUE';

export interface TreasuryBucket {
  periodKey:      string;
  from:           string;
  to:             string;
  overdue:        boolean;
  /** Reste dû sur les factures échéant dans la période, net des règlements reçus. */
  encaissements:  number;
  /** Reste à payer sur les engagements, net des règlements fournisseurs saisis. */
  decaissements:  number;
  net:            number;
  cumule:         number;
}

export type FlowSource    = 'INVOICE' | 'COST';
export type FlowDirection = 'IN' | 'OUT';

export interface TreasuryFlow {
  source:       FlowSource | string;
  direction:    FlowDirection | string;
  id:           number;
  reference:    string | null;
  libelle:      string | null;
  tiers:        string | null;
  dateEcheance: string | null;
  joursRetard:  number;
  /**
   * Converti en EUR, comme tous les montants de la page. Toujours positif — le sens est
   * porté par `direction`, jamais par le signe.
   */
  montant:      number;
  /** Toujours `'EUR'`. */
  devise:       string | null;
  /** Montant tel qu'il est en base, dans la devise de l'entité. */
  montantOrigine: number | null;
  /**
   * Devise d'origine. Égale à `devise` quand rien n'a été converti — n'afficher le
   * couple d'origine que lorsqu'elles diffèrent, sinon chaque ligne répète son montant.
   */
  deviseOrigine:  string | null;
  statut:       string | null;
}

export interface TreasurySummary {
  /** Toujours `'EUR'` — le backend normalise tout avant de sommer. */
  devise:        string;
  today:         string;
  horizonTo:     string;
  horizonMonths: number;

  creancesEchues:    number;
  creancesAVenir:    number;
  engagementsEchus:  number;
  engagementsAVenir: number;

  totalEncaissements: number;
  totalDecaissements: number;
  netHorizon:         number;
  pointBasCumule:     number;
  pointBasPeriode:    string | null;
  encaisseRecent:     number;
  /**
   * Profondeur de reprise des échéances déjà passées, en jours — identique pour les
   * encaissements et les décaissements. Fourni par le backend pour que la page n'écrive
   * pas « 90 » en dur dans une phrase traduite trois fois.
   */
  lookbackJours:      number;

  buckets:          TreasuryBucket[];
  topEncaissements: TreasuryFlow[];
  topDecaissements: TreasuryFlow[];
  /**
   * Devises écartées faute de taux `RATE_EUR_*` configuré. Les flux concernés ne sont
   * dans aucun total — les convertir à 1.0 aurait donné des chiffres faux et crédibles.
   * Vide dans le cas normal ; n'avertir que si c'est peuplé.
   */
  devisesIgnorees:  string[];
}

/** Horizons proposés, en mois. Le backend borne à [1, 24] de toute façon. */
export const TREASURY_HORIZONS = [3, 6, 12] as const;
export type TreasuryHorizon = (typeof TREASURY_HORIZONS)[number];

/**
 * Tailles de page proposées sur les deux tableaux de flux.
 *
 * Le backend ne tronque plus les listes (il renvoyait les huit plus gros montants) :
 * elles arrivent entières et la pagination est côté client, la page ayant déjà tout
 * chargé en un appel.
 */
export const FLOW_PAGE_SIZES = [10, 20, 50] as const;
