import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { SaveWipEmailTemplateRequest, WipEmailTemplate } from './wip-email-template.model';

@Injectable({ providedIn: 'root' })
export class WipEmailTemplateService {
  private readonly base = `${environment.factApiUrl}/api/fact/wip-email-templates`;
  private readonly http = inject(HttpClient);

  list(): Observable<WipEmailTemplate[]> {
    return this.http.get<WipEmailTemplate[]>(this.base);
  }

  create(dto: SaveWipEmailTemplateRequest): Observable<WipEmailTemplate> {
    return this.http.post<WipEmailTemplate>(this.base, dto);
  }

  update(id: number, dto: SaveWipEmailTemplateRequest): Observable<WipEmailTemplate> {
    return this.http.put<WipEmailTemplate>(`${this.base}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
