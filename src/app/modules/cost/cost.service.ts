import { Injectable, inject }            from '@angular/core';
import { HttpClient, HttpParams }        from '@angular/common/http';
import { Observable, catchError, of }    from 'rxjs';
import { environment }                   from '../../../environments/environment';
import {
  CostCategoryDto, UpdateCostCategoryLabelRequest, CostApprovalThresholdDto,
  CostLineDto, CreateCostLineRequest,
  CostImportResult, PageResponse,
} from './cost.model';

@Injectable({ providedIn: 'root' })
export class CostService {

  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  // ── Categories ───────────────────────────────────────────────────────────────

  getCategories(paysId: number): Observable<CostCategoryDto[]> {
    const params = new HttpParams().set('paysId', String(paysId));
    return this.http.get<CostCategoryDto[]>(`${this.base}/cost-categories`, { params }).pipe(
      catchError(() => of([] as CostCategoryDto[])),
    );
  }

  updateCategory(id: number, dto: UpdateCostCategoryLabelRequest): Observable<CostCategoryDto> {
    return this.http.patch<CostCategoryDto>(`${this.base}/cost-categories/${id}`, dto);
  }

  // ── Approval thresholds ───────────────────────────────────────────────────────

  getThresholds(paysId: number): Observable<CostApprovalThresholdDto[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<CostApprovalThresholdDto[]>(
      `${this.base}/cost/approval-thresholds`, { params },
    ).pipe(catchError(() => of([] as CostApprovalThresholdDto[])));
  }

  updateThreshold(id: number, patch: { minAmountEur?: number; maxAmountEur?: number | null; approverRoleCode?: string }): Observable<CostApprovalThresholdDto> {
    return this.http.patch<CostApprovalThresholdDto>(
      `${this.base}/cost/approval-thresholds/${id}`, patch,
    );
  }

  // ── Cost lines ───────────────────────────────────────────────────────────────

  getCostLines(filter: {
    paysId: number;
    status?: string | null;
    page?: number;
    size?: number;
  }): Observable<PageResponse<CostLineDto>> {
    let params = new HttpParams()
      .set('paysId', String(filter.paysId))
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 25));
    if (filter.status) params = params.set('status', filter.status);
    return this.http.get<PageResponse<CostLineDto>>(`${this.base}/cost-lines`, { params });
  }

  getCostLine(id: number): Observable<CostLineDto> {
    return this.http.get<CostLineDto>(`${this.base}/cost-lines/${id}`);
  }

  createCostLine(dto: CreateCostLineRequest): Observable<CostLineDto> {
    return this.http.post<CostLineDto>(`${this.base}/cost-lines`, dto);
  }

  updateCostLine(id: number, dto: Partial<CreateCostLineRequest>): Observable<CostLineDto> {
    return this.http.patch<CostLineDto>(`${this.base}/cost-lines/${id}`, dto);
  }

  // ── Approval workflow ─────────────────────────────────────────────────────────

  submitCostLine(id: number): Observable<CostLineDto> {
    return this.http.post<CostLineDto>(`${this.base}/cost-lines/${id}/submit`, {});
  }

  approveCostLine(id: number, level: string, comment?: string): Observable<CostLineDto> {
    const params = new HttpParams().set('level', level);
    return this.http.post<CostLineDto>(
      `${this.base}/cost-lines/${id}/approve`,
      { comment: comment ?? '' },
      { params },
    );
  }

  returnCostLine(id: number, level: string, comment: string): Observable<CostLineDto> {
    const params = new HttpParams().set('level', level);
    return this.http.post<CostLineDto>(
      `${this.base}/cost-lines/${id}/return`,
      { comment },
      { params },
    );
  }

  rejectCostLine(id: number, level: string, comment: string): Observable<CostLineDto> {
    const params = new HttpParams().set('level', level);
    return this.http.post<CostLineDto>(
      `${this.base}/cost-lines/${id}/reject`,
      { comment },
      { params },
    );
  }

  postCostLine(id: number): Observable<CostLineDto> {
    return this.http.post<CostLineDto>(`${this.base}/cost-lines/${id}/post`, {});
  }

  // ── Pending approvals queue ────────────────────────────────────────────────

  getPendingApprovals(paysId: number): Observable<CostLineDto[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<CostLineDto[]>(`${this.base}/cost/approvals/pending`, { params }).pipe(
      catchError(() => of([] as CostLineDto[])),
    );
  }

  // ── CSV import ────────────────────────────────────────────────────────────────

  importCsv(file: File, paysId: number): Observable<CostImportResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('paysId', String(paysId));
    return this.http.post<CostImportResult>(`${this.base}/cost-lines/import`, form);
  }

  downloadCsvTemplate(): void {
    const headers = [
      'date', 'category_number', 'description',
      'amount', 'currency_code', 'vat_amount',
      'notes', 'supplier', 'document_ref',
    ].join(',');
    const sample = [
      '2026-06-01', '1', 'Prestation topographie',
      '3500.000', 'EUR', '0', '', 'GeoSurvey SARL', 'FAC-2026-001',
    ].join(',');
    const csv  = headers + '\n' + sample + '\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'modele-import-couts.csv';
    a.click();
    URL.revokeObjectURL(url);
  }
}
