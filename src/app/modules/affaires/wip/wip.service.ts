import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { EmailPreviewDto, WipTauxDto, WipTmPreviewDto } from './wip.model';

/** `montantSaisi` is set only in "Montant" mode: the backend then stores that amount as-is
 * and re-derives `tauxSaisi` from it (the one sent here is only indicative).
 * `emailSubject`/`emailBody` are the (potentially user-edited) email text from the preview modal. */
export interface WipTauxSubmitBody {
  periodDateFrom: string;
  periodDateTo: string;
  tauxSaisi: number;
  commentaire?: string | null;
  montantSaisi?: number | null;
  emailSubject?: string | null;
  emailBody?: string | null;
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

  /** Read-only: the exact client email submitTaux()/updateTaux() would send for this body,
   * without persisting or sending anything — lets the WIP tab show a review-and-confirm popup
   * before the user triggers the real submit. */
  previewTauxEmail(affaireId: number, body: WipTauxSubmitBody): Observable<EmailPreviewDto> {
    return this.http.post<EmailPreviewDto>(`${this.base}/av/${affaireId}/taux/preview-email`, body, this.opts);
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

  validateTm(affaireId: number, dateFrom: string, dateTo: string,
             emailSubject?: string | null, emailBody?: string | null): Observable<unknown> {
    let url = `${this.base}/wip/tm/${affaireId}/validate?dateFrom=${dateFrom}&dateTo=${dateTo}`;
    if (emailSubject) url += `&emailSubject=${encodeURIComponent(emailSubject)}`;
    if (emailBody)    url += `&emailBody=${encodeURIComponent(emailBody)}`;
    return this.http.post(url, {}, this.opts);
  }

  /** Read-only: the exact client email validateTm() would send for this period, without
   * persisting or sending anything — lets the WIP tab show a review-and-confirm popup before
   * the user triggers the real validate. */
  previewValidateTmEmail(affaireId: number, dateFrom: string, dateTo: string): Observable<EmailPreviewDto> {
    return this.http.get<EmailPreviewDto>(
      `${this.base}/wip/tm/${affaireId}/validate/preview-email?dateFrom=${dateFrom}&dateTo=${dateTo}`,
      this.opts);
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

  // ── Exports Excel — générés par le backend (WipExportController) ─────────────────

  private exportBase(affaireId: number): string {
    return `${environment.factApiUrl}/api/fact/affaires/${affaireId}/wip/export`;
  }

  /** Résumé / Détails / Heures par semaine de la période — recalculés côté serveur. */
  exportTm(affaireId: number, dateFrom: string, dateTo: string, lang: string): Observable<Blob> {
    return this.http.get(`${this.exportBase(affaireId)}/tm.xlsx`, {
      params: { dateFrom, dateTo, lang }, responseType: 'blob', withCredentials: true,
    });
  }

  /** `ids` = les lignes affichées (après recherche/filtres) ; `null` = tout l'historique. */
  exportTmHistory(affaireId: number, ids: number[] | null, lang: string): Observable<Blob> {
    return this.http.post(`${this.exportBase(affaireId)}/history.xlsx`, { ids }, {
      params: { lang }, responseType: 'blob', withCredentials: true,
    });
  }

  /** Même contrat que exportTmHistory(), sur les livrables facturés. */
  exportLivrableHistory(affaireId: number, ids: number[] | null, lang: string): Observable<Blob> {
    return this.http.post(`${this.exportBase(affaireId)}/livrables.xlsx`, { ids }, {
      params: { lang }, responseType: 'blob', withCredentials: true,
    });
  }
}
