import { inject, Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Les avances sur salaire, côté finance (« Spécification fonctionnelle – avance sur salaire »,
 * payroll V39). L'avance appartient à la paie (payroll-service) : rien n'est stocké dans
 * DAF360_FACT, et une avance n'est PAS une ligne de coût.
 *
 * Chaque étape est une PERMISSION, jamais un rôle :
 *  - FACT_VALIDATE_SALARY_ADVANCE_ABOVE_THRESHOLD — valide une demande au-dessus du seuil du pays ;
 *  - FACT_APPROVE_SALARY_ADVANCE — le DAF : conditions définitives, décision, contrat signé ;
 *  - FACT_VIEW_SALARY_ADVANCES — consultation de la rubrique et des contrats.
 */

export type AdvanceStatus =
  | 'PENDING_DIRECTOR' | 'PENDING_FINANCE' | 'REJECTED' | 'APPROVED' | 'REPAYING' | 'REPAID' | 'CANCELLED';

export const ADVANCE_STATUSES: AdvanceStatus[] =
  ['PENDING_DIRECTOR', 'PENDING_FINANCE', 'APPROVED', 'REPAYING', 'REPAID', 'REJECTED', 'CANCELLED'];

export type ContractStatus = 'TO_SIGN' | 'SIGNED';

export interface AdvanceInstallmentDto {
  id: number;
  seq: number;
  /** "yyyy-MM" */
  dueMonth: string;
  amount: number;
  status: 'PLANNED' | 'DEDUCTED' | 'SKIPPED' | 'WAIVED';
}

export interface AdvanceHistoryDto {
  fromStatus: string | null;
  toStatus: string;
  actorName: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SalaryAdvanceDto {
  id: number;
  paysId: number;
  employeeUserId: number;
  employeeName: string | null;
  currency: string;
  /** Demandé jusqu'à l'approbation, accordé ensuite. */
  amount: number;
  installments: number;
  /** "yyyy-MM" — null tant que le DAF ne l'a pas fixé. */
  firstDeductionMonth: string | null;
  lastDeductionMonth: string | null;
  monthlyAmount: number | null;
  requestedAmount: number;
  requestedInstallments: number;
  /** « Date souhaitée de mise à disposition », "yyyy-MM-dd". */
  requestedAvailabilityDate: string | null;
  /** « Date d'effet », "yyyy-MM-dd". */
  effectiveDate: string | null;
  reason: string | null;
  status: AdvanceStatus;
  /** Le seuil du pays, dans la devise de l'avance ; null = pas de validation préalable. */
  directorThreshold: number | null;
  requireSignedContract: boolean;
  directorDecidedByName: string | null;
  directorDecidedAt: string | null;
  directorNotes: string | null;
  financeDecidedByName: string | null;
  financeDecidedAt: string | null;
  financeNotes: string | null;
  contractStatus: ContractStatus | null;
  contractAvailable: boolean;
  contractGeneratedAt: string | null;
  signedContractAvailable: boolean;
  signedContractUploadedByName: string | null;
  signedContractUploadedAt: string | null;
  disbursedOn: string | null;
  disbursedByName: string | null;
  outstandingAmount: number | null;
  createdAt: string;
  schedule: AdvanceInstallmentDto[];
  history: AdvanceHistoryDto[];
}

/** Les conditions définitives saisies par le DAF (spec §4). */
export interface ApproveAdvancePayload {
  grantedAmount: number;
  grantedInstallments: number;
  /** "yyyy-MM-dd" */
  effectiveDate: string;
  /** "yyyy-MM" */
  firstDeductionMonth: string;
  notes: string | null;
}

@Injectable({ providedIn: 'root' })
export class SalaryAdvanceApprovalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.payrollApiUrl}/api/payroll/salary-advances`;

  /** Au-dessus du seuil, en attente de validation préalable. */
  pendingDirector(): Observable<SalaryAdvanceDto[]> {
    return this.http.get<SalaryAdvanceDto[]>(`${this.base}/pending-director`);
  }

  /** « En attente de traitement » par le DAF. */
  pending(): Observable<SalaryAdvanceDto[]> {
    return this.http.get<SalaryAdvanceDto[]>(`${this.base}/pending-finance`);
  }

  /** La rubrique « Avances sur salaire » : tout le périmètre, filtrable par statut. */
  list(statuses: AdvanceStatus[] = []): Observable<SalaryAdvanceDto[]> {
    let params = new HttpParams();
    statuses.forEach(s => (params = params.append('status', s)));
    return this.http.get<SalaryAdvanceDto[]>(this.base, { params });
  }

  get(id: number): Observable<SalaryAdvanceDto> {
    return this.http.get<SalaryAdvanceDto>(`${this.base}/${id}`);
  }

  directorApprove(id: number, notes: string | null): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/director-approve`, { notes });
  }

  /** Le motif est obligatoire côté serveur. */
  directorReject(id: number, notes: string): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/director-reject`, { notes });
  }

  /** Accorde l'avance : échéancier construit et contrat de dette généré au dossier RH. */
  approve(id: number, payload: ApproveAdvancePayload): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/approve`, payload);
  }

  /** Le motif est obligatoire côté serveur. */
  reject(id: number, notes: string): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/reject`, { notes });
  }

  /** (Re)génère le contrat — après une indisponibilité RH à l'approbation. */
  generateContract(id: number): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/contract/generate`, {});
  }

  /** Le contrat signé et légalisé (PDF / JPG / PNG, 10 Mo), archivé au dossier RH. */
  uploadSignedContract(id: number, file: File): Observable<SalaryAdvanceDto> {
    const form = new FormData();
    form.append('file', file, file.name);
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/contract/signed`, form);
  }

  /** Le contrat généré, ou la copie signée avec `signed`. */
  contract(id: number, signed: boolean): Observable<Blob> {
    return this.http.get(`${this.base}/${id}/contract`, {
      params: new HttpParams().set('signed', signed), responseType: 'blob',
    });
  }
}
