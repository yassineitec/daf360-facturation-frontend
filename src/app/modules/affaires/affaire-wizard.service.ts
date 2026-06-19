import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { environment }        from '../../../environments/environment';
import { DisciplineDto, ExternalProjectResult } from './affaire-wizard.model';

@Injectable({ providedIn: 'root' })
export class AffaireWizardService {

  private readonly base = `${environment.factApiUrl}/api/fact/affaires`;
  private readonly http = inject(HttpClient);

  createDraft(dto: Record<string, unknown>): Observable<{ id: number; paysId: number; [key: string]: unknown }> {
    return this.http.post<{ id: number; paysId: number; [key: string]: unknown }>(
      `${this.base}/draft`, dto, { withCredentials: true });
  }

  configureAV(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/av`, dto, { withCredentials: true });
  }

  configureJAL(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/jal`, dto, { withCredentials: true });
  }

  configureTM(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/tm`, dto, { withCredentials: true });
  }

  configureCP(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/cp`, dto, { withCredentials: true });
  }

  configureRMB(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/rmb`, dto, { withCredentials: true });
  }

  configureResponsables(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/responsables`, dto, { withCredentials: true });
  }

  configurePlanning(id: number, dto: unknown): Observable<unknown> {
    return this.http.patch(`${this.base}/${id}/config/planning`, dto, { withCredentials: true });
  }

  validateAndActivate(id: number): Observable<{ id: number; [key: string]: unknown }> {
    return this.http.post<{ id: number; [key: string]: unknown }>(
      `${this.base}/${id}/validate`, {}, { withCredentials: true });
  }

  loadDraft(id: number): Observable<unknown> {
    return this.http.get(`${this.base}/${id}/draft`, { withCredentials: true });
  }

  searchDoc360Projects(q: string): Observable<ExternalProjectResult[]> {
    return this.http.get<ExternalProjectResult[]>(`${this.base}/external/search`,
      { params: { q }, withCredentials: true });
  }

  getDisciplines(ref: string): Observable<DisciplineDto[]> {
    return this.http.get<DisciplineDto[]>(`${this.base}/disciplines`,
      { params: { ref }, withCredentials: true });
  }

  updateInfo(id: number, dto: {
    intitule: string;
    clientId: number;
    notes: string | null;
    doc360Ref: string | null;
    erpReference: string | null;
    contractCurrency: string;
    billingPeriod: string;
    budgetPrevisionnel: number | null;
  }): Observable<unknown> {
    return this.http.patch<unknown>(
      `${this.base}/${id}`,
      dto,
      { withCredentials: true }
    );
  }
}
