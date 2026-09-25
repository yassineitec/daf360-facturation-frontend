import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { WipTauxDto, WipTmPreviewDto } from './wip.model';

/** `montantSaisi` is set only in "Montant" mode: the backend then stores that amount as-is
 * and re-derives `tauxSaisi` from it (the one sent here is only indicative). */
export interface WipTauxSubmitBody {
  periodDateFrom: string;
  periodDateTo: string;
  tauxSaisi: number;
  commentaire?: string | null;
  montantSaisi?: number | null;
}

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
    body: WipTauxSubmitBody,
  ): Observable<WipTauxDto> {
    return this.http.post<WipTauxDto>(`${this.base}/av/${affaireId}/taux`, body, this.opts);
  }

  updateTaux(
    tauxId: number,
    body: WipTauxSubmitBody,
  ): Observable<WipTauxDto> {
    return this.http.put<WipTauxDto>(`${this.base}/av/taux/${tauxId}`, body, this.opts);
  }

  deleteTaux(tauxId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/av/taux/${tauxId}`, this.opts);
  }

  /** Records what the client actually confirmed (read out of their email reply) — moves the
   * linked line from EN_ATTENTE_CLIENT to EN_ATTENTE_DF, where the shared DF approval queue
   * picks it up unchanged. Byte-for-byte the same shape as enterClientAmount() below (TM) —
   * an independent AV-specific endpoint, matching this codebase's per-mode convention. */
  enterAvClientAmount(affaireId: number, tauxId: number, clientApprovedAmount: number): Observable<unknown> {
    return this.http.patch(
      `${this.base}/av/${affaireId}/taux/${tauxId}/client-amount`,
      { clientApprovedAmount }, this.opts);
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

  /** Cancels a WIP T&M billing line still in EN_ATTENTE_CLIENT/EN_ATTENTE_DF/A_VERIFIER/
   * RETOURNE — releases its locked wip_tm_hours so those hours become billable again in a
   * future period. Blocked server-side once FACTURE or already ANNULE. */
  cancelLine(affaireId: number, billingLineId: number): Observable<unknown> {
    return this.http.post(
      `${this.base}/wip/tm/${affaireId}/lines/${billingLineId}/cancel`,
      {}, this.opts);
  }
}
