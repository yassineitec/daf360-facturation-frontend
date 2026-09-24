import { Injectable, inject }                from '@angular/core';
import { HttpClient, HttpParams }            from '@angular/common/http';
import { Observable, forkJoin, of }          from 'rxjs';
import { catchError, map, tap }              from 'rxjs/operators';
import { environment }                       from '../../environments/environment';
import {
  ListValueDto, ListTypeDto, CreateListValueBody, UpdateListValueBody,
} from '../modules/cost/cost.model';

@Injectable({ providedIn: 'root' })
export class FactListService {

  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  private readonly valueCache = new Map<string, ListValueDto[]>();
  private typeCache: ListTypeDto[] | null = null;

  /**
   * Les valeurs d'une liste, l'ERREUR PROPAGÉE en cas d'échec.
   *
   * À préférer partout où l'écran a de quoi afficher un message : une liste vide ne
   * distingue pas « ce pays n'a rien de paramétré » d'un service hors service, et
   * `getListValues` ci-dessous confond justement les deux.
   */
  getListValuesOrFail(typeCode: string, paysId: number): Observable<ListValueDto[]> {
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
    );
  }

  /**
   * Variante silencieuse : rend une liste vide sur échec. Conservée pour la vingtaine
   * d'appelants qui n'ont pas d'endroit où afficher une erreur — un `subscribe` sans
   * branche `error` lèverait une exception non rattrapée. Rien n'apparaît alors à l'écran :
   * seule la console porte la trace, d'où `getListValuesOrFail` juste au-dessus.
   */
  getListValues(typeCode: string, paysId: number): Observable<ListValueDto[]> {
    return this.getListValuesOrFail(typeCode, paysId).pipe(
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

  createListValue(typeCode: string, body: CreateListValueBody): Observable<ListValueDto> {
    return this.http.post<ListValueDto>(`${this.base}/admin/lists/${typeCode}/values`, body);
  }

  updateListValue(id: number, paysId: number, body: UpdateListValueBody): Observable<ListValueDto> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.patch<ListValueDto>(`${this.base}/admin/lists/values/${id}`, body, { params });
  }

  /**
   * With `paysId`, a GLOBAL value is switched off for that country only (the backend
   * writes an inactive country override); a country value is deactivated in place.
   * Without it, the row itself is deactivated for every country (legacy behaviour).
   */
  deactivateListValue(id: number, paysId?: number): Observable<void> {
    const params = paysId ? new HttpParams().set('pays', String(paysId)) : undefined;
    return this.http.post<void>(`${this.base}/admin/lists/values/${id}/deactivate`, {}, { params });
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
