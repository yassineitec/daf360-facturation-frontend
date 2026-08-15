import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TreasurySummary } from './treasury.model';

@Injectable({ providedIn: 'root' })
export class TreasuryService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /**
   * Un seul appel pour toute la page : seaux, agrégats d'en-tête et principaux flux
   * sortent du même passage sur les données, donc les découper en trois requêtes ferait
   * trois fois le même travail côté serveur pour un écran qui n'affiche jamais l'un sans
   * les autres.
   *
   * `paysId` n'est pas passé : le backend le résout depuis le porteur du JWT, et un
   * utilisateur non-admin ne peut de toute façon pas sortir de son entité.
   */
  getSummary(horizonMonths: number): Observable<TreasurySummary> {
    const params = new HttpParams().set('horizonMonths', String(horizonMonths));
    return this.http.get<TreasurySummary>(`${this.base}/treasury/summary`, { params });
  }
}
