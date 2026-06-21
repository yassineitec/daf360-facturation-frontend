import { Injectable, inject }          from '@angular/core';
import { HttpClient, HttpParams }       from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  AffaireListItem, AffaireDetail, RafDetailsDto, AffaireKpisDto,
  TsDto, CreateAffaireRequest, UpdateAffaireRequest, ChangerStatutRequest,
  CreateTsRequest, ValiderTsRequest, AffaireFilter,
  ClientDto, UserRefDto, PaysRefDto, PageResponse,
} from './affaire.model';

@Injectable({ providedIn: 'root' })
export class AffaireService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  // ── Affaires ─────────────────────────────────────────────────────────

  getAffaires(filter: AffaireFilter = {}): Observable<PageResponse<AffaireListItem>> {
    let params = new HttpParams()
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 20));
    if (filter.paysId)   params = params.set('paysId',   String(filter.paysId));
    if (filter.statut)   params = params.set('statut',   filter.statut);
    if (filter.type)     params = params.set('type',     filter.type);
    if (filter.clientId) params = params.set('clientId', String(filter.clientId));
    if (filter.search)   params = params.set('search',   filter.search);

    return this.http.get<PageResponse<AffaireListItem>>(`${this.base}/affaires`, { params });
  }

  getAffaire(id: number): Observable<AffaireDetail> {
    return this.http.get<AffaireDetail>(`${this.base}/affaires/${id}`);
  }

  getAffaireRaf(id: number): Observable<RafDetailsDto> {
    return this.http.get<RafDetailsDto>(`${this.base}/affaires/${id}/raf`);
  }

  getAffaireKpis(id: number): Observable<AffaireKpisDto> {
    return this.http.get<AffaireKpisDto>(`${this.base}/affaires/${id}/kpis`);
  }

  createAffaire(dto: CreateAffaireRequest): Observable<AffaireDetail> {
    return this.http.post<AffaireDetail>(`${this.base}/affaires`, dto);
  }

  updateAffaire(id: number, dto: UpdateAffaireRequest): Observable<AffaireDetail> {
    return this.http.put<AffaireDetail>(`${this.base}/affaires/${id}`, dto);
  }

  validerBudget(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/affaires/${id}/valider-budget`, {});
  }

  changerStatut(id: number, req: ChangerStatutRequest): Observable<void> {
    return this.http.post<void>(`${this.base}/affaires/${id}/changer-statut`, req);
  }

  deleteAffaire(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/affaires/${id}`);
  }

  // ── Travaux supplémentaires ──────────────────────────────────────────

  getTS(affaireId: number): Observable<TsDto[]> {
    return this.http.get<TsDto[]>(`${this.base}/affaires/${affaireId}/ts`);
  }

  createTS(affaireId: number, dto: CreateTsRequest): Observable<TsDto> {
    return this.http.post<TsDto>(`${this.base}/affaires/${affaireId}/ts`, dto);
  }

  validerTechnique(tsId: number, req: ValiderTsRequest): Observable<TsDto> {
    return this.http.post<TsDto>(`${this.base}/ts/${tsId}/valider-technique`, req);
  }

  validerCommerciale(tsId: number, req: ValiderTsRequest): Observable<TsDto> {
    return this.http.post<TsDto>(`${this.base}/ts/${tsId}/valider-commerciale`, req);
  }

  // ── Reference data ───────────────────────────────────────────────────

  getClients(): Observable<ClientDto[]> {
    const params = new HttpParams().set('page', '0').set('size', '200');
    return this.http.get<PageResponse<ClientDto> | ClientDto[]>(`${this.base}/clients`, { params }).pipe(
      map(res => Array.isArray(res) ? res : res.content),
      catchError(() => of([] as ClientDto[])),
    );
  }

  getUsers(): Observable<UserRefDto[]> {
    return this.http.get<UserRefDto[]>(`${this.base}/ref/users`).pipe(
      catchError(() => of([] as UserRefDto[])),
    );
  }

  getResponsableUsers(roleName: string): Observable<UserRefDto[]> {
    const params = new HttpParams().set('roleName', roleName);
    return this.http.get<UserRefDto[]>(`${this.base}/ref/users/by-role`, { params }).pipe(
      catchError(() => of([] as UserRefDto[])),
    );
  }

  getPays(): Observable<PaysRefDto[]> {
    return this.http.get<PaysRefDto[]>(`${this.base}/ref/pays`).pipe(
      catchError(() => of([] as PaysRefDto[])),
    );
  }
}
