import { PageResponse } from '../affaires/affaire.model';

export type { PageResponse };

export type InvoiceStatut =
  | 'DRAFT' | 'SUBMITTED' | 'RETURNED' | 'APPROVED'
  | 'EMITTED' | 'SENT' | 'PARTIALLY_PAID' | 'PAID'
  | 'DISPUTED' | 'CANCELLED' | 'CREDIT_NOTED';

export interface InvoiceLine {
  id?:          number;
  description:  string;
  quantity:     number;
  unitRate:     number;
  vatRatePct:   number;
  lineTotal:    number;
  vatAmount:    number;
  // Avancement — présents uniquement en mode AV (Forfaitaire), voir InvoiceLineRequest
  budgetAffaire?: number;
  pctFacture?:    number;
  pctAvancement?: number;
  pctAFacturer?:  number;
  // RMB — présent uniquement quand la ligne provient d'un frais remboursable pické
  sourceExpenseId?: number;
}

export interface InvoiceListItem {
  id:               number;
  invoiceNumber:    string | null;
  affaireId:        number | null;
  affaireRef:       string | null;
  affaireIntitule:  string | null;
  clientId:         number | null;
  clientNom:        string;
  billingMode:      string;
  montantHt:        number;
  montantTva:       number;
  montantTtc:       number;
  devise:           string;
  statut:           InvoiceStatut | string;
  invoiceType:      string | null;
  dateEmission:     string | null;
  dateEcheance:     string | null;
  datePaiementFinal:string | null;
  paysId:           number;
  createdAt:        string;
  updatedAt:        string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  tsId:                    number | null;
  tsRef:                   string | null;
  lines:                   InvoiceLine[];
  notes:                   string | null;
  bonDeCommande:           string | null;
  conditionsPaiement:      string | null;
  templateId:              number | null;
  clientValidationDocPath: string | null;
  remindersActive:         boolean;
}

/**
 * `GET /invoices/{id}/reminders` → `ReminderResponseDto`.
 *
 * Les noms suivent le DTO Java. Les précédents (`scheduledAt`, `suspended`,
 * `recipientEmails`) n'existaient dans aucune réponse : la date planifiée sortait
 * `Invalid Date` et une relance suspendue n'était jamais signalée comme telle.
 */
export interface ReminderDto {
  id:               number;
  /** Code de la règle qui a produit ce palier — la clé, pas un libellé. */
  reminderType:     string;
  invoiceId:        number;
  /**
   * Libellés portés par la règle. `null` quand plus aucune règle ne porte le code —
   * relance envoyée sous un ancien échéancier : l'écran retombe alors sur `reminderType`.
   * Les deux langues voyagent parce que le service n'a pas de locale (voir
   * `ReminderResponseDto`).
   */
  labelFr:          string | null;
  labelEn:          string | null;
  /**
   * Décalage signé du palier, `null` si le code n'a plus de règle. Le nombre brut : la
   * lettre elle-même change de langue (« J+30 » / « D+30 »), donc la mise en forme
   * appartient à l'écran — voir `offsetLabel()` dans `payments-display.ts`.
   */
  offsetDays:       number | null;
  scheduledDate:    string;
  sentAt:           string | null;
  isSent:           boolean;
  isSuspended:      boolean;
  suspensionReason: string | null;
}

/** `GET /invoices/{id}/payments` → `PaymentResponseDto`. */
export interface InvoicePaymentDto {
  id:            number;
  invoiceId:     number;
  paymentDate:   string;
  amountLocal:   number;
  currency:      string;
  paymentMethod: string | null;
  bankReference: string | null;
  recordedBy:    number | null;
  recordedAt:    string | null;
  notes:         string | null;
}

// ── Request types ─────────────────────────────────────────────────────────────

export interface InvoiceLineRequest {
  description:    string;
  quantity:       number;
  unitRate:       number;
  vatRatePct:     number;
  // Avancement — présents uniquement en mode AV (Forfaitaire)
  budgetAffaire?: number;
  pctFacture?:    number;
  pctAvancement?: number;
  pctAFacturer?:  number;
  // RMB — présent uniquement quand la ligne provient d'un frais remboursable pické
  sourceExpenseId?: number;
}

export interface CreateDraftRequest {
  paysId:              number;
  affaireId:           number | null;
  clientId:            number | null;
  projectId?:          number | null;
  billingMode:         string;
  currency:            string;
  tsId?:               number | null;
  lines:               InvoiceLineRequest[];
  notes?:              string | null;
  bonDeCommande?:      string | null;
  dueDate?:            string | null;
  templateId?:         number | null;
}

export type UpdateDraftRequest = CreateDraftRequest;

export interface ApproveDecisionRequest {
  decision: 'APPROVE' | 'RETURN' | 'REJECT';
  comment?: string | null;
}

export interface RecordPaymentRequest {
  paymentDate:    string;
  amountLocal:    number;
  paymentMethod:  string;
  bankReference?: string | null;
  notes?:         string | null;
}

export interface DisputeRequest { reason: string; }

export interface CreditNoteRequest {
  reasonCode: string;
  reasonText?: string | null;
  montantTtc?: number | null;
}

export interface InvoiceFilter {
  statut?:    string | null;
  affaireId?: number | null;
  clientId?:  number | null;
  from?:      string | null;
  to?:        string | null;
  search?:    string | null;
  page?:      number;
  size?:      number;
}

// ── Display config ─────────────────────────────────────────────────────────────

export const INVOICE_STATUT_CONFIG: Record<string, { label: string; bg: string; color: string; border: string }> = {
  DRAFT:           { label: 'INVOICING.STATUS.DRAFT',          bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  SUBMITTED:       { label: 'INVOICING.STATUS.SUBMITTED',      bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  RETURNED:        { label: 'INVOICING.STATUS.RETURNED',       bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  APPROVED:        { label: 'INVOICING.STATUS.APPROVED',       bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  EMITTED:         { label: 'INVOICING.STATUS.EMITTED',        bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },
  SENT:            { label: 'INVOICING.STATUS.SENT',           bg: '#99f6e4', color: '#065f46', border: '#2dd4bf' },
  PARTIALLY_PAID:  { label: 'INVOICING.STATUS.PARTIALLY_PAID', bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  PAID:            { label: 'INVOICING.STATUS.PAID',           bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  DISPUTED:        { label: 'INVOICING.STATUS.DISPUTED',       bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  CANCELLED:       { label: 'INVOICING.STATUS.CANCELLED',      bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  CREDIT_NOTED:    { label: 'INVOICING.STATUS.CREDIT_NOTED',   bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
};

export const INVOICE_TIMELINE_STEPS = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'EMITTED', 'SENT', 'PARTIALLY_PAID', 'PAID',
];

export const OVERDUE_STATUTS = new Set(['EMITTED', 'SENT', 'PARTIALLY_PAID']);

export const CREDIT_NOTE_REASONS: Record<string, string> = {
  ERREUR_FACTURATION: 'INVOICING.CREDIT_REASON.BILLING_ERROR',
  ANNULATION:         'INVOICING.CREDIT_REASON.CANCELLATION',
  REMISE_COMMERCIALE: 'INVOICING.CREDIT_REASON.DISCOUNT',
  AUTRE:              'INVOICING.CREDIT_REASON.OTHER',
};

export const PAYMENT_MODES: Record<string, string> = {
  VIREMENT: 'INVOICING.PAYMENT_MODE.TRANSFER',
  CHEQUE:   'INVOICING.PAYMENT_MODE.CHECK',
  ESPECES:  'INVOICING.PAYMENT_MODE.CASH',
  AUTRE:    'INVOICING.PAYMENT_MODE.OTHER',
};

export const CONDITIONS_PAIEMENT: Record<string, string> = {
  VIREMENT:  'INVOICING.CONDITIONS.TRANSFER_30',
  CHEQUE:    'INVOICING.CONDITIONS.CHECK_RECEIPT',
  COMPTANT:  'INVOICING.CONDITIONS.CASH',
  '30_JOURS':'INVOICING.CONDITIONS.30_DAYS',
  '60_JOURS':'INVOICING.CONDITIONS.60_DAYS',
  '90_JOURS':'INVOICING.CONDITIONS.90_DAYS',
};

export const TVA_RATES = [0, 7, 13, 19];
