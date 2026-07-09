import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { environment }        from '../../../environments/environment';

import {
  DisciplineExtDto, WbsExtDto, DocumentExtDto,
  AffectationManuelleItem, AffaireLivrableDto, CollaborateurTauxDto,
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
