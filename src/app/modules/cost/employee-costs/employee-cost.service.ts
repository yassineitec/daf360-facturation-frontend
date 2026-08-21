import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import {
  EmployeeCostDto, CreateEmployeeCostRequest, UpdateEmployeeCostRequest,
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
}
