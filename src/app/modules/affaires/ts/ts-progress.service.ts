import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { EmailPreviewDto } from '../wip/wip.model';
import { TsProgressSummaryDto, TsTauxDto } from './ts-progress.model';

/** `montantSaisi` is set only in "Montant" mode — mirrors WipTauxSubmitBody (wip.service.ts)
 * exactly. */
export interface TsTauxSubmitBody {
  periodDateFrom: string;
  periodDateTo: string;
  tauxSaisi: number;
  commentaire?: string | null;
  montantSaisi?: number | null;
  emailSubject?: string | null;
  emailBody?: string | null;
}

/** TS's own incremental WIP declaration loop — calls the TsProgressBillingController
 * endpoints directly, mirroring WipService's AV methods exactly (scoped by tsId instead of
 * affaireId). */
@Injectable({ providedIn: 'root' })
export class TsProgressService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact/billing/ts-taux`;
  private readonly opts = { withCredentials: true };

  getSummaryForAffaire(affaireId: number): Observable<TsProgressSummaryDto[]> {
    return this.http.get<TsProgressSummaryDto[]>(`${this.base}/affaire/${affaireId}/summary`, this.opts);
  }

  getTauxHistory(tsId: number): Observable<TsTauxDto[]> {
    return this.http.get<TsTauxDto[]>(`${this.base}/${tsId}/taux`, this.opts);
  }

  submitTaux(tsId: number, body: TsTauxSubmitBody): Observable<TsTauxDto> {
    return this.http.post<TsTauxDto>(`${this.base}/${tsId}/taux`, body, this.opts);
  }

  updateTaux(tauxId: number, body: TsTauxSubmitBody): Observable<TsTauxDto> {
    return this.http.put<TsTauxDto>(`${this.base}/taux/${tauxId}`, body, this.opts);
  }

  deleteTaux(tauxId: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/taux/${tauxId}`, this.opts);
  }

  /** Read-only: the exact client email submitTaux()/updateTaux() would send for this body,
   * without persisting or sending anything — lets the TS WIP tab show a review-and-confirm
   * popup before the user triggers the real submit. */
  previewTauxEmail(tsId: number, body: TsTauxSubmitBody): Observable<EmailPreviewDto> {
    return this.http.post<EmailPreviewDto>(`${this.base}/${tsId}/taux/preview-email`, body, this.opts);
  }

  /** Records what the client actually confirmed — moves the linked line from
   * EN_ATTENTE_CLIENT to EN_ATTENTE_DF, where the shared DF approval queue picks it up
   * unchanged. */
  enterClientAmount(tsId: number, tauxId: number, clientApprovedAmount: number): Observable<unknown> {
    return this.http.patch(
      `${this.base}/${tsId}/taux/${tauxId}/client-amount`,
      { clientApprovedAmount }, this.opts);
  }
}
