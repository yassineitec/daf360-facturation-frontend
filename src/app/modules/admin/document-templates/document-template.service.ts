import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { FactDocumentTemplateDto, SaveFactDocumentTemplateRequest } from './document-template.model';

@Injectable({ providedIn: 'root' })
export class DocumentTemplateService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact/admin/document-templates`;

  list(documentType?: string, includeInactive = false): Observable<FactDocumentTemplateDto[]> {
    const params: Record<string, string> = { includeInactive: String(includeInactive) };
    if (documentType) params['documentType'] = documentType;
    return this.http.get<FactDocumentTemplateDto[]>(this.base, { params });
  }

  getById(id: number): Observable<FactDocumentTemplateDto> {
    return this.http.get<FactDocumentTemplateDto>(`${this.base}/${id}`);
  }

  create(dto: SaveFactDocumentTemplateRequest): Observable<FactDocumentTemplateDto> {
    return this.http.post<FactDocumentTemplateDto>(this.base, dto);
  }

  update(id: number, dto: SaveFactDocumentTemplateRequest): Observable<FactDocumentTemplateDto> {
    return this.http.put<FactDocumentTemplateDto>(`${this.base}/${id}`, dto);
  }

  toggleActive(id: number): Observable<FactDocumentTemplateDto> {
    return this.http.patch<FactDocumentTemplateDto>(`${this.base}/${id}/toggle-active`, {});
  }

  /** Aperçu d'un contenu en cours d'édition — `invoiceId` facultatif (sans, des données
   * factices sont utilisées côté backend). */
  previewRaw(htmlContent: string, invoiceId?: number | null): Observable<Blob> {
    return this.http.post(`${this.base}/preview-raw`,
      { htmlContent, invoiceId: invoiceId ?? null },
      { responseType: 'blob' });
  }
}
