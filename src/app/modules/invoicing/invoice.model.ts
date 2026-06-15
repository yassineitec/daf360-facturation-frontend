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
}

export interface InvoiceListItem {
  id:               number;
  invoiceNumber:    string | null;
  affaireId:        number | null;
  affaireRef:       string | null;
  affaireIntitule:  string | null;
  clientId:         number | null;
  clientNom:        string;
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

export interface ReminderDto {
  id:              number;
  invoiceId:       number;
  reminderType:    string;
  scheduledAt:     string;
  sentAt:          string | null;
  suspended:       boolean;
  recipientEmails: string[];
}

// ── Request types ─────────────────────────────────────────────────────────────

export interface InvoiceLineRequest {
  description: string;
  quantity:    number;
  unitRate:    number;
  vatRatePct:  number;
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
  DRAFT:           { label: 'Brouillon',     bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  SUBMITTED:       { label: 'En revue',       bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  RETURNED:        { label: 'Retournée',      bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  APPROVED:        { label: 'Validée',        bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  EMITTED:         { label: 'Émise',          bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },
  SENT:            { label: 'Envoyée',        bg: '#99f6e4', color: '#065f46', border: '#2dd4bf' },
  PARTIALLY_PAID:  { label: 'Part. payée',    bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  PAID:            { label: 'Payée',          bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  DISPUTED:        { label: 'En litige',      bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  CANCELLED:       { label: 'Annulée',        bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' },
  CREDIT_NOTED:    { label: 'Avoir émis',     bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
};

export const INVOICE_TIMELINE_STEPS = [
  'DRAFT', 'SUBMITTED', 'APPROVED', 'EMITTED', 'SENT', 'PARTIALLY_PAID', 'PAID',
];

export const OVERDUE_STATUTS = new Set(['EMITTED', 'SENT', 'PARTIALLY_PAID']);

export const CREDIT_NOTE_REASONS: Record<string, string> = {
  ERREUR_FACTURATION: 'Erreur de facturation',
  ANNULATION:         'Annulation',
  REMISE_COMMERCIALE: 'Remise commerciale',
  AUTRE:              'Autre',
};

export const PAYMENT_MODES: Record<string, string> = {
  VIREMENT: 'Virement bancaire',
  CHEQUE:   'Chèque',
  ESPECES:  'Espèces',
  AUTRE:    'Autre',
};

export const CONDITIONS_PAIEMENT: Record<string, string> = {
  VIREMENT:  'Virement 30 jours',
  CHEQUE:    'Chèque à réception',
  COMPTANT:  'Comptant',
  '30_JOURS':'À 30 jours',
  '60_JOURS':'À 60 jours',
  '90_JOURS':'À 90 jours',
};

export const TVA_RATES = [0, 7, 13, 19];
