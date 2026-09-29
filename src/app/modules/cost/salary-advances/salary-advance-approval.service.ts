import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Les avances sur salaire, côté finance — qui n'est que le point de décision : approuver ou
 * refuser. L'avance appartient à la paie (payroll-service, V25) : c'est elle qui enregistre le
 * versement, suit les retenues mensuelles et porte les règles par pays. Rien n'est stocké dans
 * DAF360_FACT, et une avance n'est PAS une ligne de coût.
 *
 * Toutes ces routes exigent FACT_APPROVE_SALARY_ADVANCE côté serveur.
 */

export type AdvanceStatus =
  | 'PENDING_FINANCE' | 'REJECTED' | 'APPROVED' | 'REPAYING' | 'REPAID' | 'CANCELLED';

export interface SalaryAdvanceDto {
  id: number;
  paysId: number;
  employeeUserId: number;
  employeeName: string | null;
  currency: string;
  amount: number;
  installments: number;
  /** "yyyy-MM" */
  firstDeductionMonth: string;
  monthlyAmount: number | null;
  reason: string | null;
  status: AdvanceStatus;
  financeNotes: string | null;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class SalaryAdvanceApprovalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.payrollApiUrl}/api/payroll/salary-advances`;

  /** Les demandes en attente de la décision finance. */
  pending(): Observable<SalaryAdvanceDto[]> {
    return this.http.get<SalaryAdvanceDto[]>(`${this.base}/pending-finance`);
  }

  approve(id: number, notes: string | null): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/approve`, { notes });
  }

  /** Le motif est obligatoire côté serveur. */
  reject(id: number, notes: string): Observable<SalaryAdvanceDto> {
    return this.http.post<SalaryAdvanceDto>(`${this.base}/${id}/reject`, { notes });
  }
}
