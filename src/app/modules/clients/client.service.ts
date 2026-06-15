import { Injectable, inject }        from '@angular/core';
import { HttpClient, HttpParams }    from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { environment }               from '../../../environments/environment';
import {
  ClientListItemDto, ClientDetailDto, ClientDropdownItemDto,
  ClientStatsDto, CreateClientRequest, ClientFilter, PageResponse,
} from './client.model';
import { PaysRefDto } from '../affaires/affaire.model';

@Injectable({ providedIn: 'root' })
export class ClientService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  getClients(filter: ClientFilter = {}): Observable<PageResponse<ClientListItemDto>> {
    let params = new HttpParams()
      .set('page', String(filter.page ?? 0))
      .set('size', String(filter.size ?? 20));
    if (filter.paysId != null)    params = params.set('paysId',    String(filter.paysId));
    if (filter.search)            params = params.set('search',    filter.search);
    if (filter.isActive != null)  params = params.set('isActive',  String(filter.isActive));
    if (filter.isKycDone != null) params = params.set('isKycDone', String(filter.isKycDone));
    if (filter.sector)            params = params.set('sector',    filter.sector);
    return this.http.get<PageResponse<ClientListItemDto>>(`${this.base}/clients`, { params });
  }

  getClient(id: number): Observable<ClientDetailDto> {
    return this.http.get<ClientDetailDto>(`${this.base}/clients/${id}`);
  }

  getClientStats(id: number): Observable<ClientStatsDto> {
    return this.http.get<ClientStatsDto>(`${this.base}/clients/${id}/stats`);
  }

  getDropdown(paysId: number): Observable<ClientDropdownItemDto[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<ClientDropdownItemDto[]>(`${this.base}/clients/dropdown`, { params }).pipe(
      catchError(() => of([] as ClientDropdownItemDto[])),
    );
  }

  getSectors(paysId: number): Observable<string[]> {
    const params = new HttpParams().set('pays', String(paysId));
    return this.http.get<string[]>(`${this.base}/clients/sectors`, { params }).pipe(
      catchError(() => of([] as string[])),
    );
  }

  createClient(dto: CreateClientRequest): Observable<ClientDetailDto> {
    return this.http.post<ClientDetailDto>(`${this.base}/clients`, dto);
  }

  updateClient(id: number, dto: Partial<CreateClientRequest>): Observable<ClientDetailDto> {
    return this.http.patch<ClientDetailDto>(`${this.base}/clients/${id}`, dto);
  }

  validateKyc(id: number): Observable<ClientDetailDto> {
    return this.http.post<ClientDetailDto>(`${this.base}/clients/${id}/validate-kyc`, {});
  }

  revokeKyc(id: number): Observable<ClientDetailDto> {
    return this.http.post<ClientDetailDto>(`${this.base}/clients/${id}/revoke-kyc`, {});
  }

  deactivate(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/clients/${id}/deactivate`, {});
  }

  reactivate(id: number): Observable<void> {
    return this.http.post<void>(`${this.base}/clients/${id}/reactivate`, {});
  }

  getPays(): Observable<PaysRefDto[]> {
    return this.http.get<PaysRefDto[]>(`${this.base}/ref/pays`).pipe(
      catchError(() => of([] as PaysRefDto[])),
    );
  }

  getMyPays(): Observable<number | null> {
    return this.http.get<{ paysId: number }>(`${this.base}/ref/me`).pipe(
      map(r => r.paysId),
      catchError(() => of(null)),
    );
  }
}
