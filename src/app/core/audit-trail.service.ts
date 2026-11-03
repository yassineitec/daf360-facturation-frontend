import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface AuditTrailEntryDto {
  id: number;
  tableName: string;
  pkJson: string;
  action: 'I' | 'U' | 'D';
  oldValue: string | null;
  newValue: string | null;
  changedBy: string | null;
  changedAt: string;
}

export interface AuditTrailPage {
  content: AuditTrailEntryDto[];
  totalElements: number;
  totalPages: number;
  number: number;
}

export interface AuditTrailSearchParams {
  tableName?: string;
  actor?: string;
  from?: string;
  to?: string;
  page: number;
  size: number;
}

@Injectable({ providedIn: 'root' })
export class AuditTrailService {
  private http = inject(HttpClient);
  private base = `${environment.factApiUrl}/api/fact/audit-trail`;

  search(params: AuditTrailSearchParams): Observable<AuditTrailPage> {
    let httpParams = new HttpParams()
      .set('page', params.page)
      .set('size', params.size);
    if (params.tableName) httpParams = httpParams.set('tableName', params.tableName);
    if (params.actor) httpParams = httpParams.set('actor', params.actor);
    if (params.from) httpParams = httpParams.set('from', params.from);
    if (params.to) httpParams = httpParams.set('to', params.to);
    return this.http.get<AuditTrailPage>(this.base, { params: httpParams });
  }

  listTables(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/tables`);
  }
}
