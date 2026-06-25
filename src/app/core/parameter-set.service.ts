import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable, of }     from 'rxjs';
import { catchError }         from 'rxjs/operators';
import { environment }        from '../../environments/environment';

export interface ParameterSetDto {
  id: number;
  paramKey: string;
  paramValue: string;
  description: string | null;
}

export interface UpsertParameterSetRequest {
  paramKey: string;
  paramValue: string;
  description?: string;
}

@Injectable({ providedIn: 'root' })
export class ParameterSetService {

  private readonly base = `${environment.factApiUrl}/api/fact/admin/parameters`;
  private readonly http = inject(HttpClient);

  getAll(): Observable<ParameterSetDto[]> {
    return this.http.get<ParameterSetDto[]>(this.base).pipe(
      catchError(() => of([] as ParameterSetDto[])),
    );
  }

  upsert(dto: UpsertParameterSetRequest): Observable<ParameterSetDto> {
    return this.http.put<ParameterSetDto>(this.base, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
