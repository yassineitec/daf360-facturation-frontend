import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DeriveRatesRequest, DeriveRatesResultDto, PlMonthlyExchangeRateDto, RatesUsedPanelRowDto } from './pl-fx-rate.model';

/** Thin wrapper over `/api/fact/admin/pl-fx-rates` — every call needs `FACT_MANAGE_FX_RATES`
 *  (gated server-side; Finance-Manager-only, distinct from `FACT_ADMIN_PL_CATALOGUE`).
 *  `withCredentials: true` is applied globally by `auth.interceptor.ts`. */
@Injectable({ providedIn: 'root' })
export class PlFxRateAdminService {
  private readonly base = `${environment.factApiUrl}/api/fact/admin/pl-fx-rates`;
  private readonly http = inject(HttpClient);

  listRates(currencyPair: string): Observable<PlMonthlyExchangeRateDto[]> {
    const params = new HttpParams().set('currencyPair', currencyPair);
    return this.http.get<PlMonthlyExchangeRateDto[]>(this.base, { params });
  }

  derive(req: DeriveRatesRequest): Observable<DeriveRatesResultDto> {
    return this.http.post<DeriveRatesResultDto>(`${this.base}/derive`, req);
  }

  confirm(ids: number[]): Observable<PlMonthlyExchangeRateDto[]> {
    return this.http.post<PlMonthlyExchangeRateDto[]>(`${this.base}/confirm`, ids);
  }

  /** WP6(h) — the "rates used" panel for one closed period (app/API only, never the workbook). */
  ratesUsed(plPeriodId: number): Observable<RatesUsedPanelRowDto[]> {
    return this.http.get<RatesUsedPanelRowDto[]>(`${this.base}/used/${plPeriodId}`);
  }
}
