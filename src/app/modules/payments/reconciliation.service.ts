import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BankTransaction, ImportSummary, UnmatchedSummaryDto } from './payment.model';
import { InvoiceListItem, PageResponse } from '../invoicing/invoice.model';

@Injectable({ providedIn: 'root' })
export class ReconciliationService {
  private readonly base = `${environment.factApiUrl}/api/fact/bank-reconciliation`;
  private readonly http = inject(HttpClient);

  importFile(file: File, format: 'OFX' | 'CAMT053'): Observable<ImportSummary> {
    const fd = new FormData();
    fd.append('file', file, file.name);
    fd.append('format', format);
    // Content-Type intentionally not set — browser sets multipart boundary automatically
    return this.http.post<ImportSummary>(`${this.base}/import`, fd);
  }

  getImports(): Observable<ImportSummary[]> {
    return this.http.get<ImportSummary[]>(`${this.base}/imports`);
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
    return this.http.get<UnmatchedSummaryDto>(`${this.base}/unmatched`);
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
    return this.http.post<BankTransaction>(`${this.base}/transactions/manual`, req);
  }

  searchInvoicesForMatch(q: string): Observable<PageResponse<InvoiceListItem>> {
    const params = new HttpParams()
      .set('search', q)
      .set('size', '10')
      .set('page', '0');
    return this.http.get<PageResponse<InvoiceListItem>>(
      `${environment.factApiUrl}/api/fact/invoices`,
      { params },
    );
  }
}
