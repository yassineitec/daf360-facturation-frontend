import { Injectable, inject }          from '@angular/core';
import { HttpClient, HttpParams }        from '@angular/common/http';
import { Observable, map, catchError, of } from 'rxjs';
import { environment }                   from '../../../environments/environment';
import {
  SupplierDto, SupplierStatsDto, CreateSupplierRequest, PageResponse,
} from './supplier.model';

@Injectable({ providedIn: 'root' })
export class SupplierService {
  private readonly base = `${environment.factApiUrl}/api/fact/suppliers`;
  private readonly http = inject(HttpClient);

  /** Paginated search — uses GET /search?paysId=&q=&page=&size= */
  getSuppliers(params: {
    paysId: number;
    search?: string;
    page?: number;
    size?: number;
  }): Observable<PageResponse<SupplierDto>> {
    let p = new HttpParams()
      .set('paysId', String(params.paysId))
      .set('page', String(params.page ?? 0))
      .set('size', String(params.size ?? 20));
    if (params.search) p = p.set('q', params.search);
    return this.http.get<PageResponse<SupplierDto>>(`${this.base}/search`, { params: p });
  }

  /** Full list for stats — uses GET /?paysId= (returns List<SupplierDto>) */
  getStats(paysId: number): Observable<SupplierStatsDto> {
    const p = new HttpParams().set('paysId', String(paysId));
    return this.http.get<SupplierDto[]>(this.base, { params: p }).pipe(
      map(list => ({
        total: list.length,
        active: list.filter(s => s.isActive).length,
        pendingValidation: list.filter(s => !s.isActive).length,
      })),
      catchError(() => of({ total: 0, active: 0, pendingValidation: 0 } as SupplierStatsDto)),
    );
  }

  getSupplier(id: number): Observable<SupplierDto> {
    return this.http.get<SupplierDto>(`${this.base}/${id}`);
  }

  create(dto: CreateSupplierRequest): Observable<SupplierDto> {
    return this.http.post<SupplierDto>(this.base, dto);
  }

  update(id: number, dto: Partial<CreateSupplierRequest>): Observable<SupplierDto> {
    return this.http.patch<SupplierDto>(`${this.base}/${id}`, dto);
  }

  /** Deactivate — backend has DELETE /{id} only; reactivate not yet implemented */
  deactivate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  revealIban(id: number): Observable<{ iban: string }> {
    return this.http.get<{ iban: string }>(`${this.base}/${id}/reveal-iban`);
  }
}
