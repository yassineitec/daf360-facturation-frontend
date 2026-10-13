import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../../environments/environment';
import { BudgetLineDto, BudgetReferenceDto, UpsertBudgetLinesRequest } from './pl-reporting.model';

/**
 * Thin wrapper over `/api/fact/budget-references` — the yearly budget grid (12 months ×
 * 13 catalogue lines) a `PlReport`'s lines are compared against.
 *
 * `getByPaysAndYear` returns `null` on a `204 No Content` (no draft exists yet for that
 * pays/year) — the caller MUST handle that explicitly, it is not an error.
 */
@Injectable({ providedIn: 'root' })
export class BudgetReferenceService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /** `FACT_VIEW_PL_REPORT`. `200` + body, or `204` (no body) → `null`. */
  getByPaysAndYear(paysId: number, year: number): Observable<BudgetReferenceDto | null> {
    const params = new HttpParams().set('paysId', String(paysId)).set('year', String(year));
    return this.http.get<BudgetReferenceDto>(`${this.base}/budget-references`, {
      params,
      observe: 'response',
    }).pipe(map(res => (res.status === 204 ? null : res.body)));
  }

  /** Find-or-create. `FACT_MANAGE_PL_REPORT`. */
  createOrGet(paysId: number, year: number): Observable<BudgetReferenceDto> {
    return this.http.post<BudgetReferenceDto>(`${this.base}/budget-references`, { paysId, year });
  }

  /** Batch upsert — one network call for the whole grid. `FACT_MANAGE_PL_REPORT`. */
  upsertLines(id: number, dto: UpsertBudgetLinesRequest): Observable<BudgetLineDto[]> {
    return this.http.put<BudgetLineDto[]>(`${this.base}/budget-references/${id}/lines`, dto);
  }

  /** `FACT_ADMIN_PL_REPORT`. */
  approveCd(id: number): Observable<BudgetReferenceDto> {
    return this.http.post<BudgetReferenceDto>(`${this.base}/budget-references/${id}/approve-cd`, {});
  }

  /** `FACT_ADMIN_PL_REPORT`. */
  approveGroup(id: number): Observable<BudgetReferenceDto> {
    return this.http.post<BudgetReferenceDto>(`${this.base}/budget-references/${id}/approve-group`, {});
  }
}
