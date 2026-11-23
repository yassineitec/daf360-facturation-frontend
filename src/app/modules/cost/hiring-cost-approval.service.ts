import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface HiringCostApprovalDto {
  id: number;
  candidateId: number;
  candidateFirstName?: string;
  candidateLastName?: string;
  appliedPosition?: string;
  candidateLocation?: string;
  paysId: number;
  fiscalYear: number;
  salaireNetRh: number;
  salaireNetCandidat?: number;
  contractTypeCode: string;
  simulationSnapshot: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedBy: number;
  submittedAt: string;
  approvedBy?: number;
  approvedAt?: string;
  approvalNotes?: string;
  /** The offer round this request gates — null on a legacy pre-validation. */
  jobOfferId?: number | null;
  /** The net figure being decided on (the round's proposal). */
  proposedSalary?: number | null;
}

/** The payroll engine's answer for a net salary — what the DAF sees for its counter-proposal. */
export interface HiringSimulationResult {
  inputNet: number;
  gross: number;
  loadedCost: number;
  employeeCharges: number;
  employerCharges: number;
  irppAmount: number;
  localCurrency: string;
  convergenceOk: boolean;
}

export interface HiringSimSnapshot {
  inputNet?: number;
  gross?: number;
  loadedCost?: number;
  employeeCharges?: number;
  employerCharges?: number;
  irppAmount?: number;
  localCurrency?: string;
}

@Injectable({ providedIn: 'root' })
export class HiringCostApprovalService {
  private http   = inject(HttpClient);
  private hrBase = `${environment.hrApiUrl}/api/hr/cost-approvals`;

  getPendingByPays(paysId: number): Observable<HiringCostApprovalDto[]> {
    return this.http.get<HiringCostApprovalDto[]>(`${this.hrBase}/pending`, {
      params: { paysId: paysId.toString() },
    });
  }

  approve(id: number, notes?: string): Observable<HiringCostApprovalDto> {
    return this.http.post<HiringCostApprovalDto>(`${this.hrBase}/${id}/approve`, { notes });
  }

  /**
   * Refuse. With a counter-proposal on an offer round, that figure goes straight to the
   * candidate as the DAF's own offer — so its costing travels with it (the server refuses an
   * uncosted round).
   */
  reject(id: number, notes?: string, contrePropSalaire?: number,
         contrePropSimulationSnapshot?: string): Observable<HiringCostApprovalDto> {
    return this.http.post<HiringCostApprovalDto>(`${this.hrBase}/${id}/reject`,
      { notes, contrePropSalaire, contrePropSimulationSnapshot });
  }

  /**
   * Costs a net salary through the payroll engine — same call RH makes in the offer modal,
   * without benefits (the server would otherwise add every benefit of the country).
   */
  simulateFromNet(paysId: number, inputNet: number, contractType: string): Observable<HiringSimulationResult> {
    return this.http.post<HiringSimulationResult>(`${environment.payrollApiUrl}/api/payroll/simulations/individual`,
      { paysId, inputNet, contractType, selectedBenefitCodes: [] });
  }

  parseSnapshot(json: string): HiringSimSnapshot {
    try { return JSON.parse(json); } catch { return {}; }
  }
}
