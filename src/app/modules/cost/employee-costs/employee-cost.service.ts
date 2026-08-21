import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  EmployeeCostDto, CreateEmployeeCostRequest, UpdateEmployeeCostRequest,
  ManualEmployeeCostEntryRequest,
} from './employee-cost.model';

@Injectable({ providedIn: 'root' })
export class EmployeeCostService {
  private readonly base = `${environment.factApiUrl}/api/fact/employee-costs`;
  private readonly http = inject(HttpClient);

  list(): Observable<EmployeeCostDto[]> {
    return this.http.get<EmployeeCostDto[]>(this.base).pipe(
      catchError(() => of([] as EmployeeCostDto[])),
    );
  }

  listByEmail(email: string): Observable<EmployeeCostDto[]> {
    const params = new HttpParams().set('email', email);
    return this.http.get<EmployeeCostDto[]>(this.base, { params }).pipe(
      catchError(() => of([] as EmployeeCostDto[])),
    );
  }

  create(req: CreateEmployeeCostRequest): Observable<EmployeeCostDto> {
    return this.http.post<EmployeeCostDto>(this.base, req);
  }

  update(id: number, req: UpdateEmployeeCostRequest): Observable<EmployeeCostDto> {
    return this.http.put<EmployeeCostDto>(`${this.base}/${id}`, req);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  /** Calls the dedicated wizard write-back endpoint (gated by FACT_MANAGE_AFFAIRE, not
   * FACT_MANAGE_COST) — used only when a T&M collaborator has no employee_costs row yet.
   * Deliberately NOT the same as create(): someone filling out the affaire wizard may not
   * have cost-admin rights, which is exactly why the backend exposes this as a separate,
   * more permissively-gated endpoint (see EmployeeCostController.recordManualEntry). */
  recordManualEntry(req: ManualEmployeeCostEntryRequest): Observable<EmployeeCostDto> {
    return this.http.post<EmployeeCostDto>(`${this.base}/from-manual-entry`, req);
  }
}
