import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  PlReportDetailDto, PlReportDto, ReopenReportRequest, RequestAmendmentRequest,
} from './pl-reporting.model';

/**
 * Thin wrapper over `/api/fact/pl-reports` — the F.08 report workflow
 * (draft → submit → CD-endorse → group-accept, plus request-amendment/reopen).
 * Permissions are enforced server-side (`FACT_VIEW_PL_REPORT`/`FACT_MANAGE_PL_REPORT`/
 * `FACT_ENDORSE_PL_REPORT`/`FACT_ACCEPT_PL_REPORT`, see each method below).
 */
@Injectable({ providedIn: 'root' })
export class PlReportService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /** `FACT_VIEW_PL_REPORT`. */
  getReports(paysId: number): Observable<PlReportDto[]> {
    const params = new HttpParams().set('paysId', String(paysId));
    return this.http.get<PlReportDto[]>(`${this.base}/pl-reports`, { params });
  }

  /** `FACT_VIEW_PL_REPORT`. */
  getReport(id: number): Observable<PlReportDetailDto> {
    return this.http.get<PlReportDetailDto>(`${this.base}/pl-reports/${id}`);
  }

  /** Generates a new DRAFT report from a CLOSED period. `FACT_MANAGE_PL_REPORT`. */
  generateFromPeriod(periodId: number): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/from-period/${periodId}`, {});
  }

  /** `FACT_MANAGE_PL_REPORT`. */
  submit(id: number): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/${id}/submit`, {});
  }

  /** CD endorsement. `FACT_ENDORSE_PL_REPORT`. */
  endorse(id: number): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/${id}/endorse`, {});
  }

  /** Final group acceptance. `FACT_ACCEPT_PL_REPORT`. */
  accept(id: number): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/${id}/accept`, {});
  }

  /** `FACT_ACCEPT_PL_REPORT` OR `FACT_ENDORSE_PL_REPORT`. */
  requestAmendment(id: number, dto: RequestAmendmentRequest): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/${id}/request-amendment`, dto);
  }

  /** Only valid on a GROUP_ACCEPTED report. `FACT_ACCEPT_PL_REPORT`. */
  reopen(id: number, dto: ReopenReportRequest): Observable<PlReportDto> {
    return this.http.post<PlReportDto>(`${this.base}/pl-reports/${id}/reopen`, dto);
  }

  /**
   * Binary downloads — `Content-Disposition` (filename) is already set server-side.
   * The actual download-trigger code (creating an `<a>`, `URL.createObjectURL`, etc.)
   * belongs to the component that calls this (Task 3.2's report-detail screen).
   */
  exportXlsx(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/pl-reports/${id}/export.xlsx`, { responseType: 'blob' });
  }

  exportPdf(id: number): Observable<Blob> {
    return this.http.get(`${this.base}/pl-reports/${id}/export.pdf`, { responseType: 'blob' });
  }
}
