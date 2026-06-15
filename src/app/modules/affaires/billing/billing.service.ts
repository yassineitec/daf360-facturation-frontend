import { Injectable, inject } from '@angular/core';
import { HttpClient }          from '@angular/common/http';
import { Observable }          from 'rxjs';
import { environment }         from '../../../../environments/environment';

// ── Statut enums ──────────────────────────────────────────────────────────────

export type TauxStatut       = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE';
export type BillingLineStatut= 'EN_ATTENTE_DF' | 'VALIDE_DF' | 'FACTURE' | 'A_VERIFIER' | 'RETOURNE' | 'ANNULE';
export type JalonStatut      = 'A_FACTURER' | 'EN_ATTENTE_VALIDATION' | 'FACTURE' | 'ANNULE';
export type ExpenseStatut    = 'EN_ATTENTE' | 'VALIDE' | 'REFUSE';

// ── Core DTOs ─────────────────────────────────────────────────────────────────

export interface TauxAvancementDto {
  id:             number;
  affaireId:      number;
  taux:           number;
  valeurCalculee: number;
  statut:         TauxStatut;
  commentaire:    string | null;
  soumisAt:       string;
  evalueAt:       string | null;
  motifRefus:     string | null;
}

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

export interface ExpenseDto {
  id:              number;
  affaireId:       number;
  categorie:       string;
  montant:         number;
  dateDepense:     string;
  statut:          ExpenseStatut;
  justificatifUrl: string | null;
  commentaire:     string | null;
  soumisAt:        string;
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

export interface PendingTauxDto extends TauxAvancementDto {
  affaireRef:      string;
  affaireIntitule: string;
}

export interface PendingJalonDto extends JalonDto {
  affaireRef:      string;
  affaireIntitule: string;
}

export interface PendingBillingLineDto extends BillingLineDto {
  affaireRef:      string;
  affaireIntitule: string;
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable({ providedIn: 'root' })
export class BillingService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly opts = { withCredentials: true };

  // ── Taux d'avancement (AV) ─────────────────────────────────────────────────

  getTauxHistory(affaireId: number): Observable<TauxAvancementDto[]> {
    return this.http.get<TauxAvancementDto[]>(
      `${this.base}/affaires/${affaireId}/taux-avancement`, this.opts);
  }

  submitTaux(affaireId: number, body: { taux: number; commentaire?: string | null }): Observable<TauxAvancementDto> {
    return this.http.post<TauxAvancementDto>(
      `${this.base}/affaires/${affaireId}/taux-avancement`, body, this.opts);
  }

  validateTaux(tauxId: number): Observable<TauxAvancementDto> {
    return this.http.post<TauxAvancementDto>(
      `${this.base}/billing/taux/${tauxId}/validate`, {}, this.opts);
  }

  refuseTaux(tauxId: number, motif: string): Observable<TauxAvancementDto> {
    return this.http.post<TauxAvancementDto>(
      `${this.base}/billing/taux/${tauxId}/refuse`, { motif }, this.opts);
  }

  // ── Jalons (JAL) ──────────────────────────────────────────────────────────

  getJalons(affaireId: number): Observable<JalonDto[]> {
    return this.http.get<JalonDto[]>(
      `${this.base}/affaires/${affaireId}/jalons`, this.opts);
  }

  submitJalon(jalonId: number): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jalons/${jalonId}/submit`, {}, this.opts);
  }

  validateJalon(jalonId: number): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jalons/${jalonId}/validate`, {}, this.opts);
  }

  refuseJalon(jalonId: number, motif: string): Observable<JalonDto> {
    return this.http.post<JalonDto>(
      `${this.base}/billing/jalons/${jalonId}/refuse`, { motif }, this.opts);
  }

  // ── Billing Lines ──────────────────────────────────────────────────────────

  getBillingLines(affaireId: number): Observable<BillingLineDto[]> {
    return this.http.get<BillingLineDto[]>(
      `${this.base}/affaires/${affaireId}/billing-lines`, this.opts);
  }

  createBillingLineAV(affaireId: number, tauxId: number): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/affaires/${affaireId}/billing-lines/av`, { tauxId }, this.opts);
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
      `${this.base}/billing/lines/${lineId}/validate-df`, {}, this.opts);
  }

  returnDF(lineId: number, motif: string): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/billing/lines/${lineId}/return-df`, { motif }, this.opts);
  }

  cancelLine(lineId: number, motif: string): Observable<BillingLineDto> {
    return this.http.post<BillingLineDto>(
      `${this.base}/billing/lines/${lineId}/cancel`, { motif }, this.opts);
  }

  // ── Expenses (RMB) ─────────────────────────────────────────────────────────

  submitExpense(affaireId: number, formData: FormData): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/affaires/${affaireId}/expenses`, formData, this.opts);
  }

  getExpenses(affaireId: number): Observable<ExpenseDto[]> {
    return this.http.get<ExpenseDto[]>(
      `${this.base}/affaires/${affaireId}/expenses`, this.opts);
  }

  validateExpense(expenseId: number): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/billing/expenses/${expenseId}/validate`, {}, this.opts);
  }

  refuseExpense(expenseId: number, motif: string): Observable<ExpenseDto> {
    return this.http.post<ExpenseDto>(
      `${this.base}/billing/expenses/${expenseId}/refuse`, { motif }, this.opts);
  }

  // ── Approval Queues ────────────────────────────────────────────────────────

  getPendingTaux(): Observable<PendingTauxDto[]> {
    return this.http.get<PendingTauxDto[]>(
      `${this.base}/billing/pending-rf/taux`, this.opts);
  }

  getPendingJalons(): Observable<PendingJalonDto[]> {
    return this.http.get<PendingJalonDto[]>(
      `${this.base}/billing/pending-rf/jalons`, this.opts);
  }

  getPendingDFLines(): Observable<PendingBillingLineDto[]> {
    return this.http.get<PendingBillingLineDto[]>(
      `${this.base}/billing/pending-df`, this.opts);
  }

  // ── Audit Log ──────────────────────────────────────────────────────────────

  getAuditLog(affaireId?: number): Observable<AuditLogEntryDto[]> {
    const params = affaireId ? `?affaireId=${affaireId}` : '';
    return this.http.get<AuditLogEntryDto[]>(
      `${this.base}/billing/audit${params}`, this.opts);
  }
}
