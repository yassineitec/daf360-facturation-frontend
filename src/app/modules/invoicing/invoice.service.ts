import { Injectable, inject }          from '@angular/core';
import { HttpClient, HttpParams }       from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  InvoiceListItem, InvoiceDetail, ReminderDto,
  CreateDraftRequest, UpdateDraftRequest, ApproveDecisionRequest,
  RecordPaymentRequest, DisputeRequest, CreditNoteRequest,
  InvoiceFilter, PageResponse,
} from './invoice.model';
import { AffaireListItem, AffaireDetail } from '../affaires/affaire.model';

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  // ── Invoice CRUD ──────────────────────────────────────────────────────────

  getInvoices(filter: InvoiceFilter = {}): Observable<PageResponse<InvoiceListItem>> {
    let params = new HttpParams()
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 20));
    if (filter.statut)    params = params.set('statut',    filter.statut);
    if (filter.affaireId) params = params.set('affaireId', String(filter.affaireId));
    if (filter.clientId)  params = params.set('clientId',  String(filter.clientId));
    if (filter.from)      params = params.set('from',      filter.from);
    if (filter.to)        params = params.set('to',        filter.to);
    if (filter.search)    params = params.set('search',    filter.search);
    return this.http.get<PageResponse<InvoiceListItem>>(`${this.base}/invoices`, { params });
  }

  getInvoice(id: number): Observable<InvoiceDetail> {
    return this.http.get<InvoiceDetail>(`${this.base}/invoices/${id}`);
  }

  createDraft(dto: CreateDraftRequest): Observable<InvoiceDetail> {
    return this.http.post<InvoiceDetail>(`${this.base}/invoices`, dto);
  }

  updateDraft(id: number, dto: UpdateDraftRequest): Observable<InvoiceDetail> {
    return this.http.patch<InvoiceDetail>(`${this.base}/invoices/${id}`, dto);
  }

  // ── Lifecycle actions ──────────────────────────────────────────────────────

  submit(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/submit`, {});
  }

  approve(id: number, dto: ApproveDecisionRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/approve`, dto);
  }

  emit(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/emit`, {});
  }

  markSent(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/send`, {});
  }

  recordPayment(id: number, dto: RecordPaymentRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/payment`, dto);
  }

  openDispute(id: number, dto: DisputeRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/dispute`, dto);
  }

  resolveDispute(id: number, notes: string | null): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/dispute/resolve`, { notes });
  }

  createCreditNote(id: number, dto: CreditNoteRequest): Observable<InvoiceDetail> {
    return this.http.post<InvoiceDetail>(`${this.base}/invoices/${id}/credit-note`, dto);
  }

  suspendReminders(id: number, reason: string | null): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/suspend-reminders`, { reason });
  }

  reactivateReminders(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/invoices/${id}/reactivate-reminders`, {});
  }

  getReminders(id: number): Observable<ReminderDto[]> {
    return this.http.get<ReminderDto[]>(`${this.base}/invoices/${id}/reminders`).pipe(
      catchError(() => of([] as ReminderDto[])),
    );
  }

  // ── Affaire lookup for step 1 ──────────────────────────────────────────────

  searchAffaires(search: string): Observable<AffaireListItem[]> {
    const params = new HttpParams().set('search', search).set('size', '10').set('page', '0');
    return this.http.get<PageResponse<AffaireListItem>>(`${this.base}/affaires`, { params }).pipe(
      map(r => r.content),
      catchError(() => of([] as AffaireListItem[])),
    );
  }
}
