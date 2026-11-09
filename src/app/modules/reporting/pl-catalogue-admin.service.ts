import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  CoverageCheckResultDto, PlCataloguePreviewResultDto, PlCatalogueSourceType,
  PlCatalogueStatusConfigDto, PlCatalogueStatusConfigVersionDto, PlCategoryLineMappingDto,
  PlCategoryLineMappingVersionDto, PlCostCategoryDto, SaveCategoryMappingRequest, SaveStatusConfigRequest,
} from './pl-catalogue.model';

/** Thin wrapper over `/api/fact/admin/pl-catalogue` — every call needs `FACT_ADMIN_PL_CATALOGUE`
 *  (gated server-side; the route/menu item is also gated client-side, see reporting-list and
 *  reporting.routes). `withCredentials: true` is applied globally by `auth.interceptor.ts`. */
@Injectable({ providedIn: 'root' })
export class PlCatalogueAdminService {
  private readonly base = `${environment.factApiUrl}/api/fact/admin/pl-catalogue`;
  private readonly http = inject(HttpClient);

  // ── status config ──────────────────────────────────────────────────────────

  getStatusConfig(paysId: number | null, sourceType: PlCatalogueSourceType): Observable<PlCatalogueStatusConfigDto> {
    let params = new HttpParams().set('sourceType', sourceType);
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.get<PlCatalogueStatusConfigDto>(`${this.base}/status-config`, { params });
  }

  saveStatusConfig(req: SaveStatusConfigRequest): Observable<PlCatalogueStatusConfigDto> {
    return this.http.put<PlCatalogueStatusConfigDto>(`${this.base}/status-config`, req);
  }

  activateStatusConfig(paysId: number | null, sourceType: PlCatalogueSourceType, version: number): Observable<PlCatalogueStatusConfigDto> {
    let params = new HttpParams().set('sourceType', sourceType).set('version', String(version));
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.post<PlCatalogueStatusConfigDto>(`${this.base}/status-config/activate`, null, { params });
  }

  // ── WP1(c): version history + preview ─────────────────────────────────────

  getStatusConfigHistory(paysId: number | null, sourceType: PlCatalogueSourceType): Observable<PlCatalogueStatusConfigVersionDto[]> {
    let params = new HttpParams().set('sourceType', sourceType);
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.get<PlCatalogueStatusConfigVersionDto[]>(`${this.base}/status-config/history`, { params });
  }

  previewStatusConfig(periodId: number, sourceType: PlCatalogueSourceType, draftVersion: number): Observable<PlCataloguePreviewResultDto> {
    const params = new HttpParams()
      .set('periodId', String(periodId)).set('sourceType', sourceType).set('draftVersion', String(draftVersion));
    return this.http.get<PlCataloguePreviewResultDto>(`${this.base}/status-config/preview`, { params });
  }

  getCategoryMappingHistory(paysId: number | null): Observable<PlCategoryLineMappingVersionDto[]> {
    let params = new HttpParams();
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.get<PlCategoryLineMappingVersionDto[]>(`${this.base}/category-mapping/history`, { params });
  }

  // ── category → line mapping ───────────────────────────────────────────────

  /** DEC-CATMAP-1/3 — the real per-pays cost-category SOURCE list (not `group_catalogue_lines`),
   *  same pays scope and repository call as `getCategoryMapping`/`saveCategoryMapping` below, so
   *  the rows this screen renders can never drift from what SAVE actually validates against. */
  listRealCostCategories(paysId: number | null): Observable<PlCostCategoryDto[]> {
    let params = new HttpParams();
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.get<PlCostCategoryDto[]>(`${this.base}/category-mapping/categories`, { params });
  }

  getCategoryMapping(paysId: number | null): Observable<PlCategoryLineMappingDto> {
    let params = new HttpParams();
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.get<PlCategoryLineMappingDto>(`${this.base}/category-mapping`, { params });
  }

  saveCategoryMapping(req: SaveCategoryMappingRequest): Observable<CoverageCheckResultDto> {
    return this.http.put<CoverageCheckResultDto>(`${this.base}/category-mapping`, req);
  }

  coverageCheck(req: SaveCategoryMappingRequest): Observable<CoverageCheckResultDto> {
    return this.http.post<CoverageCheckResultDto>(`${this.base}/category-mapping/coverage-check`, req);
  }

  activateCategoryMapping(paysId: number | null, version: number): Observable<PlCategoryLineMappingDto> {
    let params = new HttpParams().set('version', String(version));
    if (paysId != null) params = params.set('paysId', String(paysId));
    return this.http.post<PlCategoryLineMappingDto>(`${this.base}/category-mapping/activate`, null, { params });
  }
}
