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

  reject(id: number, notes?: string, contrePropSalaire?: number): Observable<HiringCostApprovalDto> {
    return this.http.post<HiringCostApprovalDto>(`${this.hrBase}/${id}/reject`, { notes, contrePropSalaire });
  }

  parseSnapshot(json: string): HiringSimSnapshot {
    try { return JSON.parse(json); } catch { return {}; }
  }
}
