/**
 * Contrat de `GET /api/fact/treasury/summary`, aligné champ pour champ sur
 * `TreasurySummaryDto`.
 *
 * Deux points de vocabulaire qui portent tout l'écran :
 *
 * - **créance** ≠ **jalon**. Une créance est une facture émise : elle existe, elle est
 *   exigible. Un jalon est une date de facturation planifiée, sans facture ni titre à
 *   payer. Les deux sont des entrées attendues mais pas au même titre, et l'écran ne les
 *   additionne visuellement qu'en dernier recours.
 * - **engagement** ≠ **décaissement confirmé**. `cost_lines` ne porte aucun indicateur de
 *   règlement : impossible de savoir si une dépense a déjà été payée. Les sorties sont
 *   donc des engagements, et le backend ne reprend les échéances passées que sur 90 jours.
 *
 * Et surtout : `cumule` est une **variation** de trésorerie partant de zéro, pas un solde.
 * Le modèle facturation ne porte aucune position bancaire d'ouverture.
 */

/** Le seau de tête, qui agrège tout ce qui est déjà échu plutôt qu'un mois calendaire. */
export const OVERDUE_KEY = 'OVERDUE';

export interface TreasuryBucket {
  periodKey:             string;
  from:                  string;
  to:                    string;
  overdue:               boolean;
  encaissementsFactures: number;
  encaissementsJalons:   number;
  encaissementsTotal:    number;
  decaissements:         number;
  net:                   number;
  cumule:                number;
}

export type FlowSource    = 'INVOICE' | 'MILESTONE' | 'COST';
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
  /** Toujours positif — le sens est porté par `direction`, jamais par le signe. */
  montant:      number;
  devise:       string | null;
  statut:       string | null;
}

export interface TreasurySummary {
  devise:        string;
  today:         string;
  horizonTo:     string;
  horizonMonths: number;

  creancesEchues:    number;
  creancesAVenir:    number;
  jalonsPrevus:      number;
  engagementsEchus:  number;
  engagementsAVenir: number;

  totalEncaissements: number;
  totalDecaissements: number;
  netHorizon:         number;
  pointBasCumule:     number;
  pointBasPeriode:    string | null;
  encaisseRecent:     number;

  buckets:          TreasuryBucket[];
  topEncaissements: TreasuryFlow[];
  topDecaissements: TreasuryFlow[];
}

/** Horizons proposés, en mois. Le backend borne à [1, 24] de toute façon. */
export const TREASURY_HORIZONS = [3, 6, 12] as const;
export type TreasuryHorizon = (typeof TREASURY_HORIZONS)[number];
