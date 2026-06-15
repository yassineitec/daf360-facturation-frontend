import { Injectable, inject }                from '@angular/core';
import { HttpClient, HttpParams }            from '@angular/common/http';
import { Observable, forkJoin, of }          from 'rxjs';
import { catchError, map, tap }              from 'rxjs/operators';
import { environment }                       from '../../environments/environment';
import { ListValueDto, ListTypeDto }         from '../modules/cost/cost.model';

@Injectable({ providedIn: 'root' })
export class FactListService {

  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  private readonly valueCache = new Map<string, ListValueDto[]>();
  private typeCache: ListTypeDto[] | null = null;

  getListValues(typeCode: string, paysId: number): Observable<ListValueDto[]> {
    const key = `${typeCode}_${paysId}`;
    if (this.valueCache.has(key)) {
      return of(this.valueCache.get(key)!);
    }
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<ListValueDto[]>(`${this.base}/lists/${typeCode}`, { params }).pipe(
      tap(values => {
        if (values.length === 0) {
          console.warn(`[FactListService] No values for '${typeCode}' pays=${paysId}. Check admin configuration.`);
        }
        this.valueCache.set(key, values);
      }),
      catchError(err => {
        console.error(`[FactListService] Failed to load '${typeCode}'`, err);
        return of([] as ListValueDto[]);
      }),
    );
  }

  getAdminListValues(typeCode: string, paysId: number): Observable<ListValueDto[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<ListValueDto[]>(`${this.base}/admin/lists/${typeCode}`, { params }).pipe(
      catchError(() => of([] as ListValueDto[])),
    );
  }

  getAllListTypes(): Observable<ListTypeDto[]> {
    if (this.typeCache) return of(this.typeCache);
    return this.http.get<ListTypeDto[]>(`${this.base}/admin/lists`).pipe(
      tap(types => { this.typeCache = types; }),
      catchError(() => of([] as ListTypeDto[])),
    );
  }

  createListValue(typeCode: string, body: {
    typeCode: string; paysId: number; code: string;
    labelFr: string; labelEn?: string; displayOrder?: number; isDefault?: boolean;
  }): Observable<ListValueDto> {
    return this.http.post<ListValueDto>(`${this.base}/admin/lists/${typeCode}/values`, body);
  }

  updateListValue(id: number, body: {
    labelFr?: string; labelEn?: string; isDefault?: boolean;
  }): Observable<ListValueDto> {
    return this.http.patch<ListValueDto>(`${this.base}/admin/lists/values/${id}`, body);
  }

  deactivateListValue(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/admin/lists/values/${id}/deactivate`, {});
  }

  getDefaultValue(typeCode: string, paysId: number): Observable<ListValueDto | null> {
    return this.getListValues(typeCode, paysId).pipe(
      map(values => values.find(v => v.isDefault) ?? null),
    );
  }

  preloadAll(paysId: number): Observable<void> {
    const types = ['CURRENCY', 'COST_TYPE', 'PAYMENT_METHOD', 'RECURRENCE_FREQUENCY'];
    return forkJoin(types.map(t => this.getListValues(t, paysId))).pipe(
      map(() => void 0),
    );
  }

  invalidateCache(): void {
    this.valueCache.clear();
    this.typeCache = null;
  }

  /** Invalidate cache for a specific type+pays and reload immediately. */
  refreshListValues(typeCode: string, paysId: number): Observable<ListValueDto[]> {
    const key = `${typeCode}_${paysId}`;
    this.valueCache.delete(key);
    return this.getListValues(typeCode, paysId);
  }
}
