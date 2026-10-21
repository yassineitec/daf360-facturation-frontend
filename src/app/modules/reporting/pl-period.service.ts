import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ClosePeriodRequest, CreatePlPeriodRequest, PlPeriodDto } from './pl-reporting.model';

/**
 * Thin wrapper over `GET/POST /api/fact/pl-periods` — period GETs need `FACT_VIEW_COST`,
 * create/close/submit/approve need `FACT_MANAGE_COST` (enforced server-side).
 */
@Injectable({ providedIn: 'root' })
export class PlPeriodService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  getPeriods(paysId: number): Observable<PlPeriodDto[]> {
    const params = new HttpParams().set('paysId', String(paysId));
    return this.http.get<PlPeriodDto[]>(`${this.base}/pl-periods`, { params });
  }

  getPeriod(id: number): Observable<PlPeriodDto> {
    return this.http.get<PlPeriodDto>(`${this.base}/pl-periods/${id}`);
  }

  createPeriod(dto: CreatePlPeriodRequest): Observable<PlPeriodDto> {
    return this.http.post<PlPeriodDto>(`${this.base}/pl-periods`, dto);
  }

  closePeriod(id: number, req: ClosePeriodRequest): Observable<PlPeriodDto> {
    return this.http.post<PlPeriodDto>(`${this.base}/pl-periods/${id}/close`, req);
  }

  submitPeriod(id: number): Observable<PlPeriodDto> {
    return this.http.post<PlPeriodDto>(`${this.base}/pl-periods/${id}/submit`, {});
  }

  approvePeriod(id: number): Observable<PlPeriodDto> {
    return this.http.post<PlPeriodDto>(`${this.base}/pl-periods/${id}/approve`, {});
  }

  /**
   * Full 7-tab Excel workbook export (Template, Receivables, Missing Cash, Order Intake,
   * Pipeline, Bud {year} EUR, Bud {year} CHF), keyed by `PlPeriod.id` -- distinct from
   * `PlReportService.exportXlsx()`, the already-existing 1-sheet technical export keyed by
   * `PlReport.id`. `FACT_VIEW_PL_REPORT`.
   */
  exportWorkbook(periodId: number): Observable<Blob> {
    return this.http.get(`${this.base}/pl-periods/${periodId}/export-workbook`,
      { responseType: 'blob', withCredentials: true });
  }
}
