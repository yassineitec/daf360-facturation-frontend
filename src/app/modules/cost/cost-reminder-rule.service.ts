import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { CostReminderRule, SaveCostReminderRuleRequest } from './cost-reminder-rule.model';

@Injectable({ providedIn: 'root' })
export class CostReminderRuleService {
  private readonly base = `${environment.factApiUrl}/api/fact/cost-reminder-rules`;
  private readonly http = inject(HttpClient);

  list(paysId?: number): Observable<CostReminderRule[]> {
    const params = paysId ? new HttpParams().set('paysId', String(paysId)) : undefined;
    return this.http.get<CostReminderRule[]>(this.base, { params });
  }

  availableRoles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/available-roles`).pipe(
      catchError(() => of([] as string[])),
    );
  }

  create(dto: SaveCostReminderRuleRequest): Observable<CostReminderRule> {
    return this.http.post<CostReminderRule>(this.base, dto);
  }

  update(id: number, dto: SaveCostReminderRuleRequest): Observable<CostReminderRule> {
    return this.http.put<CostReminderRule>(`${this.base}/${id}`, dto);
  }

  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }

  dispatch(): Observable<void> {
    return this.http.post<void>(`${this.base}/dispatch`, null);
  }
}
