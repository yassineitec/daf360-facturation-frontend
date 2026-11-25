import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PaymentsDashboardStats, AgingRow, AgingFilter, PageResponse } from './payment.model';

@Injectable({ providedIn: 'root' })
export class PaymentService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /**
   * KPI de recouvrement d'UN pays. Sans `paysId`, le serveur prend le pays de l'utilisateur :
   * les montants ne s'additionnent pas d'une devise à l'autre, il n'y a donc pas de « tous ».
   */
  getStats(paysId?: number | null): Observable<PaymentsDashboardStats> {
    const params = paysId ? new HttpParams().set('paysId', String(paysId)) : undefined;
    return this.http.get<PaymentsDashboardStats>(`${this.base}/payments/stats`, { params });
  }

  getAgingRows(filter: AgingFilter = {}): Observable<PageResponse<AgingRow>> {
    let params = new HttpParams()
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 50));
    if (filter.paysId)      params = params.set('paysId',      String(filter.paysId));
    if (filter.affaireId)   params = params.set('affaireId',   String(filter.affaireId));
    if (filter.clientId)    params = params.set('clientId',    String(filter.clientId));
    if (filter.from)        params = params.set('from',        filter.from);
    if (filter.to)          params = params.set('to',          filter.to);
    if (filter.overdueOnly) params = params.set('overdueOnly', 'true');
    if (filter.search?.trim()) params = params.set('search', filter.search.trim());
    if (filter.sort)        params = params.set('sort',        filter.sort);
    return this.http.get<PageResponse<AgingRow>>(`${this.base}/payments/aging`, { params });
  }
}
