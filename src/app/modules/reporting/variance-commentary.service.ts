import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { UpdateCommentaryRequest, VarianceCommentaryDto } from './pl-reporting.model';

/**
 * Thin wrapper over `/api/fact/variance-commentaries` — per-line (and the 4 cross-cutting
 * REVENUE/COST/EBITDA/OTHER_NOTABLE) narrative rows, heuristic-drafted server-side and
 * human-edited here.
 */
@Injectable({ providedIn: 'root' })
export class VarianceCommentaryService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /** `FACT_VIEW_PL_REPORT`. */
  getByReport(plReportId: number): Observable<VarianceCommentaryDto[]> {
    const params = new HttpParams().set('plReportId', String(plReportId));
    return this.http.get<VarianceCommentaryDto[]>(`${this.base}/variance-commentaries`, { params });
  }

  /** `FACT_MANAGE_PL_REPORT`. */
  update(id: number, dto: UpdateCommentaryRequest): Observable<VarianceCommentaryDto> {
    return this.http.put<VarianceCommentaryDto>(`${this.base}/variance-commentaries/${id}`, dto);
  }
}
