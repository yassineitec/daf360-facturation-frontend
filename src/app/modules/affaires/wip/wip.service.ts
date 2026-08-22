import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { WipTauxDto, WipTmPreviewDto } from './wip.model';

@Injectable({ providedIn: 'root' })
export class WipService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact/billing`;
  private readonly opts = { withCredentials: true };

  // ── AV — calls the REAL ProgressBillingController endpoints directly, unlike
  // ../billing/billing.service.ts's equivalents (see wip.model.ts's header comment). ──

  getTauxHistory(affaireId: number): Observable<WipTauxDto[]> {
    return this.http.get<WipTauxDto[]>(`${this.base}/av/${affaireId}/taux`, this.opts);
  }

  submitTaux(
    affaireId: number,
    body: { periodYear: number; periodMonth: number; tauxSaisi: number; commentaire?: string | null },
  ): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/${affaireId}/taux`, body, this.opts);
  }

  validateTaux(tauxId: number): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/taux/${tauxId}/validate`, {}, this.opts);
  }

  refuseTaux(tauxId: number, motif: string): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/taux/${tauxId}/refuse`, { motif }, this.opts);
  }

  createBillingLineFromTaux(affaireId: number, tauxId: number): Observable<unknown> {
    return this.http.post(
      `${this.base}/av/taux/${tauxId}/billing-line?affaireId=${affaireId}`, {}, this.opts);
  }

  // ── TM — new endpoints (WipTmController) ──────────────────────────────────────

  previewTm(affaireId: number, periodYear: number, periodMonth: number): Observable<WipTmPreviewDto> {
    return this.http.get<WipTmPreviewDto>(
      `${this.base}/wip/tm/${affaireId}/preview?periodYear=${periodYear}&periodMonth=${periodMonth}`,
      this.opts);
  }

  validateTm(affaireId: number, periodYear: number, periodMonth: number): Observable<unknown> {
    return this.http.post(
      `${this.base}/wip/tm/${affaireId}/validate?periodYear=${periodYear}&periodMonth=${periodMonth}`,
      {}, this.opts);
  }
}
