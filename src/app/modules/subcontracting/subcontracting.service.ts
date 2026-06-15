import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  SousTraitantDto, OSTDto, CoutSTDto, MarginDto,
  CreateSousTraitantRequest, CreateOSTRequest, CreateCoutSTRequest,
} from './subcontracting.model';

@Injectable({ providedIn: 'root' })
export class SubcontractingService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  // ── Sous-traitants ─────────────────────────────────────────────────────

  listSousTraitants(paysId: number): Observable<SousTraitantDto[]> {
    return this.http.get<SousTraitantDto[]>(`${this.base}/sous-traitants`, {
      params: new HttpParams().set('paysId', String(paysId)),
    });
  }

  createSousTraitant(req: CreateSousTraitantRequest): Observable<SousTraitantDto> {
    return this.http.post<SousTraitantDto>(`${this.base}/sous-traitants`, req);
  }

  updateSousTraitant(id: number, req: CreateSousTraitantRequest): Observable<SousTraitantDto> {
    return this.http.patch<SousTraitantDto>(`${this.base}/sous-traitants/${id}`, req);
  }

  deleteSousTraitant(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/sous-traitants/${id}`);
  }

  // ── Ordres ST ──────────────────────────────────────────────────────────

  listOSTByAffaire(affaireId: number): Observable<OSTDto[]> {
    return this.http.get<OSTDto[]>(`${this.base}/affaires/${affaireId}/ordres-st`);
  }

  createOST(affaireId: number, req: CreateOSTRequest): Observable<OSTDto> {
    return this.http.post<OSTDto>(`${this.base}/affaires/${affaireId}/ordres-st`, req);
  }

  updateOST(ordreId: number, req: CreateOSTRequest): Observable<OSTDto> {
    return this.http.patch<OSTDto>(`${this.base}/ordres-st/${ordreId}`, req);
  }

  changerStatutOST(ordreId: number, statut: string): Observable<OSTDto> {
    return this.http.post<OSTDto>(`${this.base}/ordres-st/${ordreId}/changer-statut`, {}, {
      params: new HttpParams().set('statut', statut),
    });
  }

  // ── Coûts ──────────────────────────────────────────────────────────────

  listCouts(ordreId: number): Observable<CoutSTDto[]> {
    return this.http.get<CoutSTDto[]>(`${this.base}/ordres-st/${ordreId}/couts`);
  }

  addCout(ordreId: number, req: CreateCoutSTRequest): Observable<CoutSTDto> {
    return this.http.post<CoutSTDto>(`${this.base}/ordres-st/${ordreId}/couts`, req);
  }

  removeCout(ordreId: number, coutId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/ordres-st/${ordreId}/couts/${coutId}`);
  }

  // ── Margin + Export ────────────────────────────────────────────────────

  getMargin(affaireId: number): Observable<MarginDto> {
    return this.http.get<MarginDto>(`${this.base}/affaires/${affaireId}/marge`);
  }

  exportAccounting(ordreId: number): Observable<Blob> {
    return this.http.get(`${this.base}/ordres-st/${ordreId}/export-accounting`, {
      responseType: 'blob',
    });
  }
}
