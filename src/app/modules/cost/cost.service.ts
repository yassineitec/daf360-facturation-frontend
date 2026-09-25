import { Injectable, inject }            from '@angular/core';
import { HttpClient, HttpParams }        from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment }                   from '../../../environments/environment';
import {
  CostApprovalThresholdDto, CreateCostApprovalThresholdRequest,
  CostLineDto, CreateCostLineRequest,
  CostImportResult, PageResponse,
  CostAttachmentDto, ForexPreviewDto, CircuitPreviewDto,
  ListValueDto, SupplierSearchItem, SupplierLedgerDto, SupplierCostSummaryDto,
  RateComputationDto, CreateRateComputationRequest,
  CostLineReglementDto, CreateReglementRequest, UpdateReglementRequest,
} from './cost.model';

@Injectable({ providedIn: 'root' })
export class CostService {

  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  // Cost categories: no dedicated endpoint any more. They are the COST_CATEGORY /
  // COST_SUB_CATEGORY configurable lists — read them with getListValues(type, paysId),
  // manage them in Admin → Listes (V84 retired /cost-categories and its table).

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
    /** Cost-lines-by-supplier (2026-09-09 plan): mutually exclusive with `noSupplier`. */
    supplierId?: number | null;
    /** Cost-lines-by-supplier (2026-09-09 plan): mutually exclusive with `supplierId`. */
    noSupplier?: boolean;
    page?: number;
    size?: number;
  }): Observable<PageResponse<CostLineDto>> {
    let params = new HttpParams()
      .set('paysId', String(filter.paysId))
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 25));
    if (filter.status)             params = params.set('status', filter.status);
    if (filter.supplierId != null) params = params.set('supplierId', String(filter.supplierId));
    if (filter.noSupplier)         params = params.set('noSupplier', 'true');
    return this.http.get<PageResponse<CostLineDto>>(`${this.base}/cost-lines`, { params });
  }

  getCostLine(id: number): Observable<CostLineDto> {
    return this.http.get<CostLineDto>(`${this.base}/cost-lines/${id}`);
  }

  getSupplierLedger(costLineId: number): Observable<SupplierLedgerDto> {
    return this.http.get<SupplierLedgerDto>(`${this.base}/cost-lines/${costLineId}/supplier-ledger`).pipe(
      catchError(() => of({ supplier: null, rows: [] } as SupplierLedgerDto)),
    );
  }

  // ── Cost-lines-by-supplier (2026-09-09 plan) ──────────────────────────────────

  getCostLinesBySupplier(paysId: number): Observable<SupplierCostSummaryDto[]> {
    const params = new HttpParams().set('paysId', String(paysId));
    return this.http.get<SupplierCostSummaryDto[]>(`${this.base}/cost-lines/by-supplier`, { params }).pipe(
      catchError(() => of([] as SupplierCostSummaryDto[])),
    );
  }

  /** Same ledger as `getSupplierLedger()`, entered directly by supplierId instead of
   *  via a cost-line id -- used by the `cost/supplier/:supplierId` detail-page route. */
  getLedgerForSupplier(supplierId: number): Observable<SupplierLedgerDto> {
    return this.http.get<SupplierLedgerDto>(`${this.base}/suppliers/${supplierId}/cost-ledger`).pipe(
      catchError(() => of({ supplier: null, rows: [] } as SupplierLedgerDto)),
    );
  }

  // ── Manual règlement (payment) feature (2026-09-10 plan) ───────────────────────

  createReglement(costLineId: number, req: CreateReglementRequest): Observable<CostLineReglementDto> {
    return this.http.post<CostLineReglementDto>(`${this.base}/cost-lines/${costLineId}/reglement`, req);
  }

  updateReglement(reglementId: number, req: UpdateReglementRequest): Observable<CostLineReglementDto> {
    return this.http.put<CostLineReglementDto>(`${this.base}/reglements/${reglementId}`, req);
  }

  deleteReglement(reglementId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/reglements/${reglementId}`);
  }

  getReglement(reglementId: number): Observable<CostLineReglementDto> {
    return this.http.get<CostLineReglementDto>(`${this.base}/reglements/${reglementId}`);
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

  getCircuitPreview(
    amountEur: number, paysId: number, costCategoryId?: number | null,
  ): Observable<CircuitPreviewDto> {
    let params = new HttpParams()
      .set('amountEur', String(amountEur))
      .set('paysId', String(paysId));
    if (costCategoryId != null) params = params.set('costCategoryId', String(costCategoryId));
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

  getSupplier(id: number): Observable<SupplierSearchItem> {
    return this.http.get<SupplierSearchItem>(`${this.base}/suppliers/${id}`);
  }

  // ── Rate computations ──────────────────────────────────────────────────────

  getRateComputations(paysId: number): Observable<RateComputationDto[]> {
    const params = new HttpParams().set('paysId', String(paysId));
    return this.http.get<RateComputationDto[]>(`${this.base}/rate-computations`, { params }).pipe(
      catchError(() => of([] as RateComputationDto[])),
    );
  }

  createRateComputation(req: CreateRateComputationRequest): Observable<RateComputationDto> {
    return this.http.post<RateComputationDto>(`${this.base}/rate-computations`, req);
  }

  computeRateComputation(id: number): Observable<RateComputationDto> {
    return this.http.post<RateComputationDto>(`${this.base}/rate-computations/${id}/compute`, {});
  }

  validateRateComputation(id: number): Observable<RateComputationDto> {
    return this.http.post<RateComputationDto>(`${this.base}/rate-computations/${id}/validate`, {});
  }

  /**
   * Same columns, same order, as CostImportService.parseCsvRow() reads them. The old
   * template (date first, a category NUMBER, a currency CODE…) matched nothing the
   * backend parses. `categoryCode` is a category or sub-category code from Admin →
   * Listes for the importing pays; `currencyId` is the CURRENCY list value id.
   */
  downloadCsvTemplate(): void {
    const headers = [
      'paysId', 'categoryCode', 'transactionDate', 'periodYear', 'periodMonth',
      'description', 'netAmountLocal', 'vatAmountLocal', 'currencyId',
    ].join(',');
    const sample = [
      '178', 'LOYER', '2026-06-01', '2026', '6',
      'Loyer juin', '1500.000', '0', '13',
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
