import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Révisions salariales, côté finance — qui n'est que le point de décision du Directeur Pays.
 * La demande appartient à la paie (payroll-service V38) : elle est soumise depuis l'onglet
 * Rémunération (RH) ou la fiche paie, et n'est APPLIQUÉE au salaire qu'à l'approbation.
 *
 * Routes exigeant APPROVE_HIRING_COST côté serveur — le code qui décide déjà les coûts
 * d'embauche des candidats.
 */
export interface SalaryChangeBreakdown {
  baseSalary: number;
  bonuses: number;
  gross: number;
  taxableBenefits: number;
  nonTaxableBenefits: number;
  employeeCharges: number;
  taxableBase: number;
  irpp: number;
  net: number;
  employerCharges: number;
  employerCost: number;
}

export interface SalaryChangeDto {
  id: number;
  profileUserId: number;
  employeeName: string | null;
  paysId: number;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  contractType: string;
  selectedBenefitCodes: string[];
  grossSalary: number;
  inputCurrency: string | null;
  workingCurrency: string | null;
  currentGrossSalary: number | null;
  currentNetSalary: number | null;
  newGrossSalary: number | null;
  newNetSalary: number | null;
  monthlyCostBefore: number | null;
  monthlyCostAfter: number | null;
  effectiveDate: string | null;
  reason: string;
  simulation: {
    currency: string;
    benefits: { code: string; labelFr: string | null; labelEn: string | null; monthlyValue: number | null; taxable: boolean | null }[];
    bonuses: { label: string; amount: number; bonusCurrency: string; amountInCurrency: number }[];
    monthly: SalaryChangeBreakdown;
    withBonuses: SalaryChangeBreakdown | null;
  } | null;
  submittedBy: number;
  submittedByName: string | null;
  submittedAt: string;
}

@Injectable({ providedIn: 'root' })
export class SalaryChangeApprovalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.payrollApiUrl}/api/payroll/salary-changes`;

  /** Demandes en attente, dans le périmètre pays de l'appelant (filtré par la paie). */
  pending(): Observable<SalaryChangeDto[]> {
    return this.http.get<SalaryChangeDto[]>(`${this.base}/pending`);
  }

  /** Applique la révision au salaire du collaborateur. */
  approve(id: number, notes: string | null): Observable<SalaryChangeDto> {
    return this.http.post<SalaryChangeDto>(`${this.base}/${id}/approve`, { notes });
  }

  /** Le motif est obligatoire côté serveur ; rien n'est appliqué. */
  reject(id: number, notes: string): Observable<SalaryChangeDto> {
    return this.http.post<SalaryChangeDto>(`${this.base}/${id}/reject`, { notes });
  }
}
