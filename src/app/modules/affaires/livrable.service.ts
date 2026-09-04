import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { environment }        from '../../../environments/environment';

import {
  DisciplineExtDto, WbsExtDto, DocumentExtDto,
  AffectationManuelleItem, AffaireLivrableDto, CollaborateurTauxDto, LivrableTauxEntry,
  LivrableBatchDto,
} from './livrable.model';

@Injectable({ providedIn: 'root' })
export class LivrableService {

  private readonly base = `${environment.factApiUrl}/api/fact/affaires`;
  private readonly http = inject(HttpClient);

  // ── LIVRABLE — DB externe ─────────────────────────────────────────────────

  getDisciplines(affaireId: number): Observable<DisciplineExtDto[]> {
    return this.http.get<DisciplineExtDto[]>(
      `${this.base}/${affaireId}/livrables/disciplines`,
      { withCredentials: true });
  }

  getWbs(affaireId: number, disciplineId: string): Observable<WbsExtDto[]> {
    return this.http.get<WbsExtDto[]>(
      `${this.base}/${affaireId}/livrables/disciplines/${disciplineId}/wbs`,
      { withCredentials: true });
  }

  getDocumentsByWbs(affaireId: number, wbsId: string): Observable<DocumentExtDto[]> {
    return this.http.get<DocumentExtDto[]>(
      `${this.base}/${affaireId}/livrables/wbs/${wbsId}/documents`,
      { withCredentials: true });
  }

  getAllDocsByDiscipline(affaireId: number, disciplineId: string): Observable<DocumentExtDto[]> {
    return this.http.get<DocumentExtDto[]>(
      `${this.base}/${affaireId}/livrables/disciplines/${disciplineId}/documents`,
      { withCredentials: true });
  }

  // ── LIVRABLE — Affectation ────────────────────────────────────────────────

  affecterManuel(
    affaireId: number,
    disciplineId: string,
    affectations: AffectationManuelleItem[],
  ): Observable<AffaireLivrableDto[]> {
    return this.http.post<AffaireLivrableDto[]>(
      `${this.base}/${affaireId}/livrables/affectation-manuelle?disciplineId=${encodeURIComponent(disciplineId)}`,
      affectations,
      { withCredentials: true });
  }

  affecterAuto(
    affaireId: number,
    disciplineId: string,
    budgetGlobal: number,
    documentIds: string[],
  ): Observable<AffaireLivrableDto[]> {
    return this.http.post<AffaireLivrableDto[]>(
      `${this.base}/${affaireId}/livrables/affectation-auto?disciplineId=${encodeURIComponent(disciplineId)}`,
      { budgetGlobal, documentIds },
      { withCredentials: true });
  }

  getLivrables(affaireId: number): Observable<AffaireLivrableDto[]> {
    return this.http.get<AffaireLivrableDto[]>(
      `${this.base}/${affaireId}/livrables`,
      { withCredentials: true });
  }

  /** Submits one or more documents' newly-entered cumulative percentages as one batch —
   * lands on EN_ATTENTE_CLIENT (previously this created the invoice immediately; see
   * docs/superpowers/specs/2026-09-04-livrable-df-approval-design.md). */
  submitLivrables(
    affaireId: number,
    entries: LivrableTauxEntry[],
    billingDate?: string,
  ): Observable<LivrableBatchDto> {
    return this.http.post<LivrableBatchDto>(
      `${this.base}/${affaireId}/livrables/submit`,
      { entries, billingDate },
      { withCredentials: true });
  }

  /** Every batch for this affaire still in a pre-FACTURE state — feeds the WIP tab's
   * per-document "in flight" badges and its Edit/Cancel actions. */
  getActiveBatches(affaireId: number): Observable<LivrableBatchDto[]> {
    return this.http.get<LivrableBatchDto[]>(
      `${this.base}/${affaireId}/livrables/batches/active`,
      { withCredentials: true });
  }

  /** Only valid while every line in the batch is EN_ATTENTE_CLIENT. confirmedTotal can be
   * less than the batch's combinedMontant but never more — the backend rejects that. Moves
   * the whole batch to EN_ATTENTE_DF. */
  enterClientAmountForBatch(
    affaireId: number,
    batchId: number,
    confirmedTotal: number,
  ): Observable<LivrableBatchDto> {
    return this.http.patch<LivrableBatchDto>(
      `${this.base}/${affaireId}/livrables/batches/${batchId}/client-amount`,
      { confirmedTotal },
      { withCredentials: true });
  }

  /** Cancel-then-resubmit server-side — the returned batch has a NEW batchId, never the one
   * passed in. Callers must re-key any local state (editing/expanded row, etc.) off the
   * response, not the batchId they called with. */
  editBatch(
    affaireId: number,
    batchId: number,
    entries: LivrableTauxEntry[],
    billingDate?: string,
  ): Observable<LivrableBatchDto> {
    return this.http.put<LivrableBatchDto>(
      `${this.base}/${affaireId}/livrables/batches/${batchId}`,
      { entries, billingDate },
      { withCredentials: true });
  }

  /** Valid at any pre-FACTURE state (EN_ATTENTE_CLIENT/EN_ATTENTE_DF/A_VERIFIER/RETOURNE) —
   * unlike editBatch, this stays available even after the client has confirmed a number. */
  cancelBatch(affaireId: number, batchId: number): Observable<LivrableBatchDto> {
    return this.http.post<LivrableBatchDto>(
      `${this.base}/${affaireId}/livrables/batches/${batchId}/cancel`,
      {},
      { withCredentials: true });
  }

  // ── TM — Calcul des taux ──────────────────────────────────────────────────

  calculateTaux(
    affaireId: number,
    paysId: number,
    userIds: number[],
  ): Observable<CollaborateurTauxDto[]> {
    return this.http.post<CollaborateurTauxDto[]>(
      `${this.base}/${affaireId}/ressources-tm/calculate?paysId=${paysId}`,
      { userIds },
      { withCredentials: true });
  }
}
