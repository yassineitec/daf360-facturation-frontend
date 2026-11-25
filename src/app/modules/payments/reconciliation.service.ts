import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { Store } from '@ngrx/store';
import { selectSelectedCountryId } from '@khalilrebhiitec/daf360';
import { environment } from '../../../environments/environment';
import { BankTransaction, ImportSummary, UnmatchedSummaryDto } from './payment.model';
import { InvoiceListItem, PageResponse } from '../invoicing/invoice.model';
import { HeaderPaysService } from '../../core/header-pays.service';
import { ClientService } from '../clients/client.service';
import { toSignal } from '@angular/core/rxjs-interop';

/**
 * Rapprochement bancaire.
 *
 * Le pays est le drapeau de la navbar (store partagé avec le shell), lu ICI plutôt que passé
 * par chaque appelant : l'import de relevé et la saisie manuelle partent de composants enfants
 * (dropzone, modale), et tous doivent viser la même entité que les listes affichées. Le serveur
 * résout un `paysId` absent (« Tous les pays ») vers le pays de l'utilisateur, et
 * PaysIsolationInterceptor refuse un pays hors de la portée du rôle.
 */
@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private readonly base = `${environment.factApiUrl}/api/fact/bank-reconciliation`;
  private readonly http = inject(HttpClient);
  /** Ids FINANCE de tous les drapeaux cochés (`178,63`) ; undefined = « Tous les pays ». */
  private readonly headerPaysList = inject(HeaderPaysService).paysList;
  /** Le pays de l'utilisateur côté FINANCE (`/ref/me`). */
  private readonly ownPaysId = toSignal(inject(ClientService).getMyPays(), { initialValue: null });

  /**
   * Les entités LISTÉES (relevés, factures candidates, export) : tous les drapeaux cochés ;
   * null = tout le périmètre du rôle.
   */
  listPays(): string | null {
    return this.headerPaysList() ?? null;
  }

  /**
   * L'entité d'une action ou d'un total qui n'en prend qu'UNE (import d'un relevé, saisie
   * manuelle, synthèse des non-rapprochés — des montants dans une seule devise) : un drapeau
   * → ce pays ; aucun → null (le serveur prend le pays de l'utilisateur) ; plusieurs → le
   * pays de l'utilisateur s'il est coché, sinon le premier coché.
   */
  paysId(): number | null {
    const ids = (this.listPays() ?? '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (ids.length <= 1) return ids[0] ?? null;
    const own = this.ownPaysId();
    return own != null && ids.includes(own) ? own : ids[0];
  }

  /** `?paysId=` d'UNE entité quand il y en a une, rien sinon. */
  private paysParams(): HttpParams {
    const id = this.paysId();
    return id != null ? new HttpParams().set('paysId', String(id)) : new HttpParams();
  }

  /** `?paysId=178,63` des entités listées, rien pour « Tous les pays ». */
  private listParams(): HttpParams {
    const pays = this.listPays();
    return pays ? new HttpParams().set('paysId', pays) : new HttpParams();
  }

  importFile(file: File, format: 'OFX' | 'CAMT053'): Observable<ImportSummary> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('format', format);
    // Content-Type intentionally not set — browser sets multipart boundary automatically
    return this.http.post<ImportSummary>(`${this.base}/import`, fd, { params: this.paysParams() });
  }

  getImports(): Observable<ImportSummary[]> {
    return this.http.get<ImportSummary[]>(`${this.base}/imports`, { params: this.listParams() });
  }

  getTransactions(importId: number): Observable<BankTransaction[]> {
    return this.http.get<BankTransaction[]>(`${this.base}/imports/${importId}/transactions`);
  }

  confirmMatch(txId: number, invoiceId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/transactions/${txId}/confirm`, { invoiceId });
  }

  rejectMatch(txId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/transactions/${txId}/reject`, {});
  }

  getUnmatchedSummary(): Observable<UnmatchedSummaryDto> {
    return this.http.get<UnmatchedSummaryDto>(`${this.base}/unmatched`, { params: this.paysParams() });
  }

  confirmPartialMatch(txId: number, invoiceId: number, partialAmount: number): Observable<void> {
    return this.http.post<void>(`${this.base}/transactions/${txId}/confirm-partial`, { invoiceId, partialAmount });
  }

  recordAcompte(txId: number, clientId: number, commentaire?: string): Observable<void> {
    return this.http.post<void>(`${this.base}/transactions/${txId}/record-acompte`, { clientId, commentaire });
  }

  createManualTransaction(req: {
    transactionDate: string;
    amount: number;
    currency?: string;
    reference?: string;
    description?: string;
  }): Observable<BankTransaction> {
    return this.http.post<BankTransaction>(`${this.base}/transactions/manual`, req, { params: this.paysParams() });
  }

  /** Factures candidates au rapprochement — du pays du drapeau quand il y en a un. */
  searchInvoicesForMatch(q: string): Observable<PageResponse<InvoiceListItem>> {
    const params = this.listParams()
      .set('search', q)
      .set('size', '10')
      .set('page', '0');
    return this.http.get<PageResponse<InvoiceListItem>>(
      `${environment.factApiUrl}/api/fact/invoices`,
      { params },
    );
  }
}
