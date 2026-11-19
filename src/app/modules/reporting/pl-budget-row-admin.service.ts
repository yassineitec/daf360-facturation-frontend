import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  BudgetRowCoverageCheckResultDto, PlBudgetRowDto, PlBudgetRowMappingDto, SaveBudgetRowMappingRequest,
} from './pl-budget-row.model';

/** Thin wrapper over `/api/fact/admin/pl-catalogue/budget-row*` — every call needs
 *  `FACT_ADMIN_PL_CATALOGUE` (gated server-side). No `paysId` anywhere — Budget's row assignment
 *  is global, unlike `PlCatalogueAdminService`'s category-mapping calls. */
@Injectable({ providedIn: 'root' })
export class PlBudgetRowAdminService {
  private readonly base = `${environment.factApiUrl}/api/fact/admin/pl-catalogue`;
  private readonly http = inject(HttpClient);

  listBudgetRows(): Observable<PlBudgetRowDto[]> {
    return this.http.get<PlBudgetRowDto[]>(`${this.base}/budget-rows`);
  }

  getBudgetRowMapping(): Observable<PlBudgetRowMappingDto> {
    return this.http.get<PlBudgetRowMappingDto>(`${this.base}/budget-row-mapping`);
  }

  saveBudgetRowMapping(req: SaveBudgetRowMappingRequest): Observable<BudgetRowCoverageCheckResultDto> {
    return this.http.put<BudgetRowCoverageCheckResultDto>(`${this.base}/budget-row-mapping`, req);
  }

  coverageCheck(req: SaveBudgetRowMappingRequest): Observable<BudgetRowCoverageCheckResultDto> {
    return this.http.post<BudgetRowCoverageCheckResultDto>(`${this.base}/budget-row-mapping/coverage-check`, req);
  }

  activateBudgetRowMapping(version: number): Observable<PlBudgetRowMappingDto> {
    const params = new HttpParams().set('version', String(version));
    return this.http.post<PlBudgetRowMappingDto>(`${this.base}/budget-row-mapping/activate`, null, { params });
  }
}
