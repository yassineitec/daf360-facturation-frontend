import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SubmissionCalendarDto, UpsertSubmissionCalendarRequest } from './pl-reporting.model';

/** Thin wrapper over `/api/fact/submission-calendar` — 12 rows/year, deadline per month. */
@Injectable({ providedIn: 'root' })
export class SubmissionCalendarService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /** `FACT_VIEW_PL_REPORT`. Omitting `year` falls back server-side to current+next year. */
  getCalendar(year?: number): Observable<SubmissionCalendarDto[]> {
    const params = year != null ? new HttpParams().set('year', String(year)) : undefined;
    return this.http.get<SubmissionCalendarDto[]>(`${this.base}/submission-calendar`, { params });
  }

  /** `FACT_ADMIN_PL_REPORT`. */
  upsert(dto: UpsertSubmissionCalendarRequest): Observable<SubmissionCalendarDto> {
    return this.http.put<SubmissionCalendarDto>(`${this.base}/submission-calendar`, dto);
  }
}
