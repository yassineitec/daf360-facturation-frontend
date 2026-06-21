import { Injectable, inject }            from '@angular/core';
import { HttpClient, HttpParams }        from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment }                   from '../../../environments/environment';
import {
  CostCategoryDto, UpdateCostCategoryLabelRequest, CreateCostCategoryRequest,
  CostApprovalThresholdDto, CreateCostApprovalThresholdRequest,
  CostLineDto, CreateCostLineRequest,
  CostImportResult, PageResponse,
  CostAttachmentDto, ForexPreviewDto, CircuitPreviewDto,
  ListValueDto, SupplierSearchItem,
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

  createCategory(dto: CreateCostCategoryRequest): Observable<CostCategoryDto> {
    return this.http.post<CostCategoryDto>(`${this.base}/cost-categories`, dto);
  }

  deactivateCategory(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cost-categories/${id}`);
  }

  // ── Approval thresholds ───────────────────────────────────────────────────────

  getThresholds(paysId: number): Observable<CostApprovalThresholdDto[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<CostApprovalThresholdDto[]>(
      `${this.base}/cost/approval-thresholds`, { params },
    ).pipe(catchError(() => of([] as CostApprovalThresholdDto[])));
  }

  createThreshold(dto: CreateCostApprovalThresholdRequest): Observable<CostApprovalThresholdDto> {
    return this.http.post<CostApprovalThresholdDto>(`${this.base}/cost/approval-thresholds`, dto);
  }

  updateThreshold(id: number, patch: { minAmountEur?: number; maxAmountEur?: number | null; approverRoleCode?: string }): Observable<CostApprovalThresholdDto> {
    return this.http.patch<CostApprovalThresholdDto>(
      `${this.base}/cost/approval-thresholds/${id}`, patch,
    );
  }

  deactivateThreshold(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cost/approval-thresholds/${id}`);
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

  // ── D3-127: Forex preview ──────────────────────────────────────────────────

  getForexPreview(amount: number, currency: string): Observable<ForexPreviewDto> {
    const params = new HttpParams()
      .set('amount', String(amount))
      .set('currency', currency);
    return this.http.get<ForexPreviewDto>(`${this.base}/cost-lines/forex-preview`, { params });
  }

  getCircuitPreview(amountEur: number, paysId: number, categoryId?: number | null): Observable<CircuitPreviewDto> {
    let params = new HttpParams()
      .set('amountEur', String(amountEur))
      .set('paysId', String(paysId));
    if (categoryId != null) params = params.set('categoryId', String(categoryId));
    return this.http.get<CircuitPreviewDto>(`${this.base}/cost-lines/circuit-preview`, { params });
  }

  // ── D3-124/125: Attachments ────────────────────────────────────────────────

  addAttachment(costId: number, file: File): Observable<CostAttachmentDto> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<CostAttachmentDto>(`${this.base}/cost-lines/${costId}/attachments`, formData);
  }

  listAttachments(costId: number): Observable<CostAttachmentDto[]> {
    return this.http.get<CostAttachmentDto[]>(`${this.base}/cost-lines/${costId}/attachments`).pipe(
      catchError(() => of([] as CostAttachmentDto[])),
    );
  }

  removeAttachment(costId: number, attachId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/cost-lines/${costId}/attachments/${attachId}`);
  }

  // ── D3-112: Configurable list values ─────────────────────────────────────────

  getListValues(typeCode: string, paysId?: number): Observable<ListValueDto[]> {
    if (paysId == null) return of([]);
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<ListValueDto[]>(`${this.base}/lists/${typeCode}`, { params }).pipe(
      catchError(() => of([] as ListValueDto[])),
    );
  }

  // ── D3-113: Supplier search autocomplete ──────────────────────────────────────

  searchSuppliers(paysId: number, q?: string): Observable<SupplierSearchItem[]> {
    let params = new HttpParams().set('paysId', String(paysId)).set('size', '15');
    if (q) params = params.set('q', q);
    return this.http.get<{ content: SupplierSearchItem[] }>(`${this.base}/suppliers/search`, { params }).pipe(
      map(page => page.content),
      catchError(() => of([] as SupplierSearchItem[])),
    );
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
