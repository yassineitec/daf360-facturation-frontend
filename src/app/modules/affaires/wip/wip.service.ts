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
    body: { periodDateFrom: string; periodDateTo: string; tauxSaisi: number; commentaire?: string | null },
  ): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/${affaireId}/taux`, body, this.opts);
  }

  validateTaux(tauxId: number): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/taux/${tauxId}/validate`, {}, this.opts);
  }

  refuseTaux(tauxId: number, motif: string): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/taux/${tauxId}/refuse`, { motif }, this.opts);
  }

  updateTaux(
    tauxId: number,
    body: { periodDateFrom: string; periodDateTo: string; tauxSaisi: number; commentaire?: string | null },
  ): Observable<WipTauxDto> {
    return this.http.put<WipTauxDto>(`${this.base}/av/taux/${tauxId}`, body, this.opts);
  }

  deleteTaux(tauxId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/av/taux/${tauxId}`, this.opts);
  }

  createBillingLineFromTaux(affaireId: number, tauxId: number): Observable<unknown> {
    return this.http.post(
      `${this.base}/av/taux/${tauxId}/billing-line?affaireId=${affaireId}`, {}, this.opts);
  }

  // ── TM — new endpoints (WipTmController) ──────────────────────────────────────

  /** dateFrom/dateTo are ISO date strings (yyyy-MM-dd) — an arbitrary range, no longer tied
   * to a calendar month (see WipTmController/WipTmService). */
  previewTm(affaireId: number, dateFrom: string, dateTo: string): Observable<WipTmPreviewDto> {
    return this.http.get<WipTmPreviewDto>(
      `${this.base}/wip/tm/${affaireId}/preview?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      this.opts);
  }

  validateTm(affaireId: number, dateFrom: string, dateTo: string): Observable<unknown> {
    return this.http.post(
      `${this.base}/wip/tm/${affaireId}/validate?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      {}, this.opts);
  }

  /** Records what the client actually confirmed (read out of their email reply) — moves the
   * line from EN_ATTENTE_CLIENT to EN_ATTENTE_DF, where the existing DF approval queue picks
   * it up unchanged. */
  enterClientAmount(affaireId: number, billingLineId: number, clientApprovedAmount: number): Observable<unknown> {
    return this.http.patch(
      `${this.base}/wip/tm/${affaireId}/lines/${billingLineId}/client-amount`,
      { clientApprovedAmount }, this.opts);
  }
}
