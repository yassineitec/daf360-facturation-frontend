import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentsDashboardStats, AgingRow, AgingFilter, PageResponse } from './payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  getStats(): Observable<PaymentsDashboardStats> {
    return this.http.get<PaymentsDashboardStats>(`${this.base}/payments/stats`);
  }

  getAgingRows(filter: AgingFilter = {}): Observable<PageResponse<AgingRow>> {
    let params = new HttpParams()
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 50));
    if (filter.affaireId)   params = params.set('affaireId',   String(filter.affaireId));
    if (filter.clientId)    params = params.set('clientId',    String(filter.clientId));
    if (filter.from)        params = params.set('from',        filter.from);
    if (filter.to)          params = params.set('to',          filter.to);
    if (filter.overdueOnly) params = params.set('overdueOnly', 'true');
    return this.http.get<PageResponse<AgingRow>>(`${this.base}/payments/aging`, { params });
  }
}
