import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ReminderRule, SaveReminderRuleRequest } from './reminder-rule.model';

@Injectable({ providedIn: 'root' })
export class ReminderRuleService {
  private readonly base = `${environment.factApiUrl}/api/fact/reminder-rules`;
  private readonly http = inject(HttpClient);

  /** Toutes les règles, tous périmètres. `paysId` restreint à celles qui s'appliquent à une entité. */
  list(paysId?: number): Observable<ReminderRule[]> {
    const params = paysId ? new HttpParams().set('paysId', String(paysId)) : undefined;
    return this.http.get<ReminderRule[]>(this.base, { params });
  }

  /**
   * Les rôles réellement portés dans `users_ref` — la seule colonne sur laquelle le
   * planificateur sait résoudre des adresses. Un échec ne doit pas bloquer l'écran : on
   * retombe sur une liste vide, et le formulaire laisse alors saisir le rôle à la main.
   */
  availableRoles(): Observable<string[]> {
    return this.http.get<string[]>(`${this.base}/available-roles`).pipe(
      catchError(() => of([] as string[])),
    );
  }

  create(dto: SaveReminderRuleRequest): Observable<ReminderRule> {
    return this.http.post<ReminderRule>(this.base, dto);
  }

  update(id: number, dto: SaveReminderRuleRequest): Observable<ReminderRule> {
    return this.http.put<ReminderRule>(`${this.base}/${id}`, dto);
  }

  /** Refusé côté serveur si des relances portent le code — désactiver à la place. */
  delete(id: number): Observable<void> {
    return this.http.delete<void>(`${this.base}/${id}`);
  }
}
