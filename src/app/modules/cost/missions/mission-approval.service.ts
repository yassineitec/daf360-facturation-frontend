import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Les ordres de mission, lus **directement sur l'API RH** (`hrApiUrl`) — même montage que
 * {@link HiringCostApprovalService} pour l'approbation des coûts d'embauche.
 *
 * Rien n'est répliqué dans DAF360_FACT : la mission appartient au processus RH (V78), la
 * finance n'en prend que la décision finale. Une table jumelle ici imposerait une
 * synchronisation, et deux vérités possibles sur un même coût.
 */

export type MissionStatus =
  | 'PENDING_HR' | 'REJECTED_HR' | 'PENDING_FINANCE'
  | 'APPROVED' | 'REJECTED_FINANCE' | 'CANCELLED';

export type MissionScope = 'NATIONAL' | 'INTERNATIONAL';

/** Le sous-ensemble de la fiche de frais que cet écran affiche réellement. */
export interface MissionExpenseDto {
  currency: string | null;
  missionAllowance: number | null;
  lodgingCost: number | null;
  hotelName: string | null;
  nights: number | null;
  reservationNumber: string | null;
  transportMode: string | null;
  transportCarrier: string | null;
  ticketReference: string | null;
  ticketCost: number | null;
  outboundAt: string | null;
  returnAt: string | null;
  visaFees: number | null;
  insuranceFees: number | null;
  otherFees: number | null;
  otherFeesLabel: string | null;
  advanceAmount: number | null;
  paymentMethod: string | null;
  cashPickupDate: string | null;
  documentPickupDate: string | null;
  hrNotes: string | null;
  totalEstimatedCost: number | null;
  preparedBy: number | null;
  preparedAt: string | null;
}

export interface MissionDto {
  id: number;
  paysId: number | null;
  employeeUserId: number;
  employeeName: string | null;
  employeeRoleName: string | null;
  createdBy: number;
  createdByName: string | null;
  responsableUserId: number | null;
  responsableDisplayName: string | null;
  title: string;
  details: string | null;
  startDate: string;
  endDate: string;
  durationDays: number;
  scope: MissionScope;
  destinationPaysId: number | null;
  countryLabel: string | null;
  city: string;
  address: string | null;
  status: MissionStatus;
  hrValidatedBy: number | null;
  hrValidatedByName: string | null;
  hrValidatedAt: string | null;
  hrNotes: string | null;
  financeDecidedBy: number | null;
  financeDecidedByName: string | null;
  financeDecidedAt: string | null;
  financeNotes: string | null;
  createdAt: string;
  expenses: MissionExpenseDto | null;
}

@Injectable({ providedIn: 'root' })
export class MissionApprovalService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.hrApiUrl}/api/hr/missions`;

  /** La file d'attente finance : les missions validées par RH et chiffrées. */
  pending(): Observable<MissionDto[]> {
    return this.http.get<MissionDto[]>(`${this.base}/pending-finance`);
  }

  approve(id: number, notes: string | null): Observable<MissionDto> {
    return this.http.post<MissionDto>(`${this.base}/${id}/finance-approve`, { notes });
  }

  /** Le motif est **obligatoire** côté serveur — un refus sans motif repart en 400. */
  reject(id: number, notes: string): Observable<MissionDto> {
    return this.http.post<MissionDto>(`${this.base}/${id}/finance-reject`, { notes });
  }
}
