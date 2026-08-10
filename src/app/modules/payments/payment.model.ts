import { PageResponse } from '../affaires/affaire.model';

export type { PageResponse };

export type MatchStatut = 'UNMATCHED' | 'PROPOSED' | 'CONFIRMED' | 'REJECTED' | 'PARTIALLY_MATCHED' | 'ACOMPTE';

export interface PaymentsDashboardStats {
  enAttenteMontant:        number;
  enRetardCount:           number;
  enRetardMontant:         number;
  encaisseThisMoisMontant: number;
  delaiMoyenPaiement:      number;
  devise:                  string;
}

export interface AgingRow {
  invoiceId:          number;
  invoiceNumber:      string | null;
  affaireId:          number | null;
  affaireRef:         string | null;
  clientNom:          string;
  montantTtc:         number;
  devise:             string;
  dateEcheance:       string | null;
  joursRetard:        number;
  lastReminderType:   string | null;
  lastReminderSentAt: string | null;
  statut:             string;
}

export interface AgingFilter {
  affaireId?:  number | null;
  clientId?:   number | null;
  from?:       string | null;
  to?:         string | null;
  overdueOnly?: boolean;
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
