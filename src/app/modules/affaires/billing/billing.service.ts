import { Injectable, inject } from '@angular/core';
import { HttpClient }          from '@angular/common/http';
import { Observable }          from 'rxjs';
import { environment }         from '../../../../environments/environment';
import { LivrableBatchDto } from '../livrable.model';

// ── Statut enums ──────────────────────────────────────────────────────────────

export type BillingLineStatut= 'EN_ATTENTE_CLIENT' | 'EN_ATTENTE_DF' | 'VALIDE_DF' | 'FACTURE' | 'A_VERIFIER' | 'RETOURNE' | 'ANNULE';
export type JalonStatut      = 'A_FACTURER' | 'EN_ATTENTE_VALIDATION' | 'FACTURE' | 'ANNULE';
// Les quatre valeurs de la contrainte `CK_Expense_Statut`. `REFUSE` n'existe pas en
// base — c'est `REJETE` — et le code le cherchait donc en vain : un frais rejeté
// n'était jamais reconnu et son statut s'affichait brut.
export type ExpenseStatut    = 'EN_ATTENTE' | 'VALIDE' | 'REJETE' | 'INTEGRE';

// ── Core DTOs ─────────────────────────────────────────────────────────────────

export interface BillingLineDto {
  id:          number;
  affaireId:   number;
  reference:   string;
  periode:     string | null;
  dateBilling: string;
  montantHt:   number;
  mode:        string;
  wip:         number;
  statut:      BillingLineStatut;
  factureRef:  string | null;
  motifRetour: string | null;
  /** Set once DF validation has created the draft invoice for this line
   * (DFValidationService.validateDF) — null before that. */
  invoiceId?:  number | null;
}

export interface JalonDto {
  id:        number;
  affaireId: number;
  ordre:     number;
  label:     string;
  montant:   number;
  echeance:  string | null;
  statut:    JalonStatut;
}

/**
 * Aligné champ pour champ sur `ExpenseItemDto` du backend — il ne l'était pas.
 *
 * L'interface déclarait `categorie`, `dateDepense` et `soumisAt`, trois noms que le
 * serveur n'envoie jamais (`expenseCategoryId`, `expenseDate`, `createdAt`) : la
 * catégorie, la date et l'horodatage étaient donc systématiquement vides dans le
 * tableau des frais. Les champs de validation et de rejet, eux, n'étaient pas déclarés
 * du tout, alors qu'ils portent l'essentiel de l'historique.
 */
export interface ExpenseDto {
  id:                number;
  affaireId:         number;
  userId:            number;
  expenseCategoryId: number;
  montant:           number;
  devise:            string;
  expenseDate:       string;
  commentaire:       string | null;
  /** Null depuis que le justificatif dépend de la catégorie (V32/V33). */
  justificatifUrl:   string | null;
  justificatifName:  string | null;
  statut:            ExpenseStatut;
  billingLotId:      number | null;
  motifRejet:        string | null;
  validatedBy:       number | null;
  validatedAt:       string | null;
  createdAt:         string;
}

export interface AuditLogEntryDto {
  id:          number;
  action:      string;
  entityType:  string;
  entityId:    number;
  userId:      number;
  userNom:     string;
  commentaire: string | null;
  createdAt:   string;
}

// ── Extended DTOs for approval queue (backend adds affaire context) ────────────

/** Deliberately not `extends JalonDto` — field names don't match what the backend actually
 * sends; this interface mirrors the backend's record field-for-field instead. */
export interface PendingJalonDto {
  id:                 number;
  affaireId:          number;
  affaireRef:         string;
  affaireIntitule:    string;
  label:              string;
  montant:            number;
  datePrevisionnelle: string | null;
  statut:             JalonStatut;
  ordre:              number;
}

export interface PendingBillingLineDto extends BillingLineDto {
  affaireRef:      string;
  affaireIntitule: string;
}

/** One row per LIVRABLE batch sitting at EN_ATTENTE_DF, cross-affaire — mirrors the
 * backend's PendingLivrableBatchDto. Grouped by batch, unlike PendingBillingLineDto which
 * every other mode still lists one row per document/line. */
export interface PendingLivrableBatchDto {
  batchId:         number;
  affaireId:       number;
  affaireRef:      string;
  affaireIntitule: string;
  documentCount:   number;
  combinedMontant: number;
  billingDate:     string;
}

/**
 * Mirrors the backend's PendingCreditNoteDto. Unlike the three lists above, a credit
 * note isn't a BillingLine — it's a real Invoice (invoiceType=CREDIT_NOTE) submitted
 * directly at creation (see InvoiceService.createCreditNote), so validating one goes
 * through the ordinary invoicing approve+emit endpoints (InvoiceService in the
 * `invoicing` module), not DFValidationService.
 */
export interface PendingCreditNoteDto {
  id:                   number;
  affaireId:            number | null;
  affaireRef:           string | null;
  affaireIntitule:      string | null;
  linkedInvoiceId:      number | null;
  linkedInvoiceNumber:  string | null;
  montantTtc:           number;
  creditNoteReason:     string | null;
  creditNoteReasonFree: string | null;
  submittedAt:          string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly opts = { withCredentials: true };

  // ── Jalons (JAL) ──────────────────────────────────────────────────────────

  getJalons(affaireId: number): Observable<JalonDto[]> {
    return this.http.get<JalonDto[]>(
      `${this.base}/billing/jal/${affaireId}/jalons`, this.opts);
  }

  submitJalon(jalonId: number): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jalons/${jalonId}/submit`, {}, this.opts);
  }

  validateJalon(jalonId: number): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jal/jalons/${jalonId}/validate`, {}, this.opts);
  }

  refuseJalon(jalonId: number, motif: string): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jal/jalons/${jalonId}/refuse`, { motif }, this.opts);
  }

  // ── Billing Lines ──────────────────────────────────────────────────────────

  getBillingLines(affaireId: number): Observable<BillingLineDto[]> {
    return this.http.get<BillingLineDto[]>(
      `${this.base}/affaires/${affaireId}/billing-lines`, this.opts);
  }

  createBillingLineTM(affaireId: number, body: { periode: string; montantHt: number }): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/affaires/${affaireId}/billing-lines/tm`, body, this.opts);
  }

  createBillingLineCP(affaireId: number, body: { periode: string; montantHt: number; note?: string | null }): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/affaires/${affaireId}/billing-lines/cp`, body, this.opts);
  }

  validateDF(lineId: number): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/billing/df/lines/${lineId}/validate`, {}, this.opts);
  }

  returnDF(lineId: number, motif: string): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/billing/df/lines/${lineId}/return`,
      { actionType: 'RETOURNE', motif }, this.opts);
  }

  cancelLine(lineId: number, motif: string): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/billing/df/lines/${lineId}/return`,
      { actionType: 'ANNULE', motif }, this.opts);
  }

  // ── Expenses (RMB) ─────────────────────────────────────────────────────────

  submitExpense(affaireId: number, formData: FormData): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/billing/rmb/${affaireId}/expenses`, formData, this.opts);
  }

  getExpenses(affaireId: number): Observable<ExpenseDto[]> {
    return this.http.get<ExpenseDto[]>(
      `${this.base}/billing/rmb/${affaireId}/expenses`, this.opts);
  }

  /** Frais VALIDE, non encore facturés, dans la devise de l'affaire — pour le picker de la facture. */
  getBillableExpenses(affaireId: number, devise: string): Observable<ExpenseDto[]> {
    return this.http.get<ExpenseDto[]>(
      `${this.base}/billing/rmb/${affaireId}/expenses/billable?devise=${encodeURIComponent(devise)}`,
      this.opts);
  }

  validateExpense(expenseId: number): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/billing/rmb/expenses/${expenseId}/validate`, {}, this.opts);
  }

  refuseExpense(expenseId: number, motif: string): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/billing/rmb/expenses/${expenseId}/reject`, { motif }, this.opts);
  }

  // ── Approval Queues ────────────────────────────────────────────────────────

  getPendingJalons(): Observable<PendingJalonDto[]> {
    return this.http.get<PendingJalonDto[]>(
      `${this.base}/billing/pending-rf/jalons`, this.opts);
  }

  getPendingDFLines(): Observable<PendingBillingLineDto[]> {
    return this.http.get<PendingBillingLineDto[]>(
      `${this.base}/billing/pending-df`, this.opts);
  }

  /** LIVRABLE's own grouped-by-batch pending-DF listing — excluded from getPendingDFLines()
   * on the backend so a multi-document submission shows as one row here instead of several
   * ungrouped ones there. */
  getPendingLivrableBatches(): Observable<PendingLivrableBatchDto[]> {
    return this.http.get<PendingLivrableBatchDto[]>(
      `${this.base}/billing/pending-df/livrable-batches`, this.opts);
  }

  /** Credit notes (avoirs) sitting SUBMITTED, cross-affaire — see PendingCreditNoteDto. */
  getPendingCreditNotes(): Observable<PendingCreditNoteDto[]> {
    return this.http.get<PendingCreditNoteDto[]>(
      `${this.base}/billing/pending-df/credit-notes`, this.opts);
  }

  getLivrableBatchDetail(batchId: number): Observable<LivrableBatchDto> {
    return this.http.get<LivrableBatchDto>(
      `${this.base}/billing/livrable-batches/${batchId}`, this.opts);
  }

  /** Validating creates one shared invoice server-side, emitted immediately — same
   * redirect-on-invoiceId pattern as validateDF() above. */
  validateLivrableBatch(batchId: number): Observable<LivrableBatchDto> {
    return this.http.post<LivrableBatchDto>(
      `${this.base}/billing/livrable-batches/${batchId}/validate`, {}, this.opts);
  }

  returnLivrableBatch(batchId: number, motif: string): Observable<LivrableBatchDto> {
    return this.http.post<LivrableBatchDto>(
      `${this.base}/billing/livrable-batches/${batchId}/return`,
      { actionType: 'RETOURNE', motif }, this.opts);
  }

  // ── Audit Log ──────────────────────────────────────────────────────────────

  getAuditLog(affaireId?: number): Observable<AuditLogEntryDto[]> {
    const params = affaireId ? `?affaireId=${affaireId}` : '';
    return this.http.get<AuditLogEntryDto[]>(
      `${this.base}/billing/audit${params}`, this.opts);
  }

  /** Full history for one entity (before/after status + who + when) — used by the approval detail page. */
  getAuditByEntity(entityType: string, entityId: number): Observable<EntityAuditLogDto[]> {
    return this.http.get<EntityAuditLogDto[]>(
      `${this.base}/billing/audit/${entityType}/${entityId}`, this.opts);
  }

  // ── Approval detail page — single-item fetches ──────────────────────────────
  // These mirror the REAL backend records field-for-field — their field names deliberately
  // don't match `JalonDto`/`BillingLineDto` above.

  getJalonDetail(jalonId: number): Observable<JalonDetailDto> {
    return this.http.get<JalonDetailDto>(`${this.base}/billing/jal/jalons/${jalonId}`, this.opts);
  }

  getLineDetail(lineId: number): Observable<LineDetailDto> {
    return this.http.get<LineDetailDto>(`${this.base}/billing/df/lines/${lineId}`, this.opts);
  }

  /** Same endpoints as `getJalons`/`getBillingLines`, correctly typed for the detail page. */
  getJalonsDetailed(affaireId: number): Observable<JalonDetailDto[]> {
    return this.http.get<JalonDetailDto[]>(`${this.base}/billing/jal/${affaireId}/jalons`, this.opts);
  }

  getBillingLinesDetailed(affaireId: number): Observable<LineDetailDto[]> {
    return this.http.get<LineDetailDto[]>(`${this.base}/affaires/${affaireId}/billing-lines`, this.opts);
  }
}

export interface EntityAuditLogDto {
  id:           number;
  affaireId:    number | null;
  entityType:   string;
  entityId:     number;
  action:       string;
  actorId:      number;
  actorRole:    string | null;
  statutAvant:  string | null;
  statutApres:  string | null;
  commentaire:  string | null;
  timestampUtc: string;
  billingMode:  string | null;
  metadata:     string | null;
}

export interface JalonDetailDto {
  id:                 number;
  affaireId:          number;
  label:              string;
  description:        string | null;
  montant:            number;
  ordre:              number;
  datePrevisionnelle: string | null;
  statut:             JalonStatut;
  invoiceId:          number | null;
  createdBy:          number | null;
}

export interface LineDetailDto {
  id:               number;
  affaireId:        number;
  billingMode:      string;
  periodYear:       number;
  periodMonth:      number;
  billingDate:      string;
  /** Real date range for a WIP T&M line (arbitrary range, not tied to a calendar month) or
   * an AV line (mirrors its taux's range) — null for every other billing mode, which still
   * only ever has periodYear/periodMonth. */
  periodDateFrom:   string | null;
  periodDateTo:     string | null;
  montantHt:        number;
  tvaRate:          number;
  montantTva:       number;
  montantTtc:       number;
  devise:           string;
  tauxAvancementId: number | null;
  jalonId:          number | null;
  wipAmount:        number | null;
  statut:           BillingLineStatut;
  submittedAt:      string | null;
  rfValidatedBy:    number | null;
  rfValidatedAt:    string | null;
  rfMotif:          string | null;
  dfValidatedBy:    number | null;
  dfValidatedAt:    string | null;
  dfMotif:          string | null;
  invoiceId:        number | null;
  createdBy:        number | null;
  /** WIP T&M client-approval workflow — null for every other billing mode. */
  clientApprovedAmount:     number | null;
  wipCarriedForward:        number | null;
  carriedForwardFromLineId: number | null;
  clientNotifiedAt:         string | null;
}
