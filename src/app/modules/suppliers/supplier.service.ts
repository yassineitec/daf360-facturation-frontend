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

  /**
   * Statistiques du référentiel, comptées côté client sur `GET /?paysId=`.
   *
   * ⚠️ Cet endpoint ne renvoie **que les fournisseurs actifs**
   * (`findByPaysIdAndIsActiveTrueOrderByNameAsc`). Compter `isActive` dessus ne pouvait
   * donc produire que `active === total` et `pendingValidation === 0` : on compte
   * maintenant ce que la réponse contient réellement — complétude bancaire, complétude
   * fiscale, couverture géographique.
   */
  getStats(paysId: number): Observable<SupplierStatsDto> {
    const p = new HttpParams().set('paysId', String(paysId));
    return this.http.get<SupplierDto[]>(this.base, { params: p }).pipe(
      map(list => ({
        total:     list.length,
        withIban:  list.filter(s => !!s.ibanMasked).length,
        withTva:   list.filter(s => !!s.numeroTva).length,
        countries: new Set(list.map(s => s.paysCode).filter(Boolean)).size,
      })),
      catchError(() => of({ total: 0, withIban: 0, withTva: 0, countries: 0 } as SupplierStatsDto)),
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

  /**
   * Désactivation (`DELETE /{id}` → `isActive = false`).
   *
   * Il n'y a **pas** de réactivation : aucun endpoint ne remet `isActive` à vrai, et de
   * toute façon ni la liste ni la recherche ne renvoient les inactifs, donc un
   * fournisseur désactivé sort du référentiel visible. L'ancienne fiche proposait un
   * bouton « Réactiver » qui ne pouvait jamais s'afficher ni fonctionner.
   */
  deactivate(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  revealIban(id: number): Observable<{ iban: string }> {
    return this.http.get<{ iban: string }>(`${this.base}/${id}/reveal-iban`);
  }
}
