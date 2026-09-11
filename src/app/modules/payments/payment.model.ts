import { PageResponse } from '../affaires/affaire.model';

export type { PageResponse };

export type MatchStatut = 'UNMATCHED' | 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'PARTIALLY_MATCHED' | 'ACOMPTE';

/**
 * Les indicateurs de `/finance/recouvrement`. Tous les montants sont **nets des
 * règlements reçus** — ils sortent de `ReceivablesService`, comme la trésorerie.
 *
 * `delaiMoyenPaiement` a disparu : il ne se calculait que sur les factures soldées des
 * six derniers mois, donc les créances en retard jamais encaissées — le sujet même de
 * cet écran — n'entraient pas dans la moyenne, qui s'améliorait à mesure que l'arriéré
 * vieillissait. Remplacé par la tranche la plus dure de la balance âgée.
 */
export interface PaymentsDashboardStats {
  enAttenteMontant:        number;
  enRetardCount:           number;
  enRetardMontant:         number;
  encaisseThisMoisMontant: number;
  /** Créances échues depuis plus de 90 jours — nombre et montant. */
  plus90Count:             number;
  plus90Montant:           number;
  devise:                  string;
}

export interface AgingRow {
  invoiceId:          number;
  invoiceNumber:      string | null;
  affaireId:          number | null;
  affaireRef:         string | null;
  clientNom:          string;
  /** Le montant du document, TTC — ce qui a été facturé. */
  montantTtc:         number;
  /**
   * **Reste dû** : `montantTtc` moins les règlements reçus, plancher à zéro. C'est le
   * chiffre mis en avant par la liste. L'indicateur « en attente » en haut de page est
   * net depuis qu'il passe par `ReceivablesService` ; la ligne, elle, affichait encore
   * le montant plein, si bien qu'une facture à moitié réglée se lisait deux fois sur le
   * même écran avec deux nombres différents.
   */
  montantRestant:     number;
  devise:             string;
  dateEcheance:       string | null;
  joursRetard:        number;
  /** Code de la règle du dernier palier envoyé — la clé, pas un libellé. */
  lastReminderType:   string | null;
  /**
   * Libellés portés par la règle du palier. `null` quand plus aucune règle ne porte le
   * code (relance envoyée sous un ancien échéancier) : l'écran retombe alors sur
   * `lastReminderType`. Les paliers étant configurables, leur liste n'est plus connue à
   * la compilation et ne peut plus vivre dans un fichier i18n.
   */
  lastReminderLabelFr: string | null;
  lastReminderLabelEn: string | null;
  lastReminderSentAt: string | null;
  statut:             string;
}

export interface AgingFilter {
  affaireId?:  number | null;
  clientId?:   number | null;
  from?:       string | null;
  to?:         string | null;
  overdueOnly?: boolean;
  /** Numéro de facture ou nom de client — filtré par le serveur, sur tout l'encours. */
  search?:     string | null;
  page?:       number;
  size?:       number;
}

export interface BankTransaction {
  id:                    number;
  importId:              number;
  transactionDate:       string;
  reference:             string | null;
  description:           string | null;
  montant:               number;
  statut:                MatchStatut | string;
  proposedInvoiceId:     number | null;
  proposedInvoiceNumber: string | null;
  proposedClientNom:     string | null;
  confidence:            number | null;
  devise:                string;
  matchedAmount:         number | null;
  remainingAmount:       number | null;
  isPartialMatch:        boolean;
  isAcompte:             boolean;
}

export interface ImportSummary {
  id:               number;
  importDate:       string;
  filename:         string;
  format:           'OFX' | 'CAMT053' | string;
  transactionCount: number;
  matchedCount:     number;
  unmatchedCount:   number;
}

export interface AgingBucket {
  count:   number;
  montant: number;
}

export interface UnmatchedSummaryDto {
  totalUnmatchedAmount: number;
  devise:               string;
  bucket0_30:           AgingBucket;
  bucket31_60:          AgingBucket;
  bucket61_90:          AgingBucket;
  bucket90plus:         AgingBucket;
}

export const MATCH_STATUT_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  UNMATCHED:         { label: 'Non rapproché', bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  PROPOSED:          { label: 'Proposition',   bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  CONFIRMED:         { label: 'Confirmé',      bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  REJECTED:          { label: 'Rejeté',        bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  PARTIALLY_MATCHED: { label: 'Partiel',       bg: '#e0f2fe', color: '#0369a1', border: '#7dd3fc' },
  ACOMPTE:           { label: 'Acompte',       bg: '#faf5ff', color: '#7c3aed', border: '#c4b5fd' },
};

// `agingRowColor()` lived here and returned raw hex for a hand-rolled row tint that
// the aging table painted onto a wrapper div inside every one of its seven cells.
// Aging severity is now a badge variant — see `retardVariant` in `payments-display.ts`.
