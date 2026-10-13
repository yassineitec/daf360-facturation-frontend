import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GroupCatalogueLineDto } from './pl-reporting.model';

/**
 * Thin wrapper over `/api/fact/group-catalogue-lines` — the 13 global P&L catalogue lines
 * (REVENUE + the 12 COST_CATEGORY codes, V98 seed). Read-only reference data, not per-pays.
 */
@Injectable({ providedIn: 'root' })
export class GroupCatalogueLineService {
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly http = inject(HttpClient);

  /** `FACT_VIEW_PL_REPORT`. */
  list(): Observable<GroupCatalogueLineDto[]> {
    return this.http.get<GroupCatalogueLineDto[]>(`${this.base}/group-catalogue-lines`);
  }
}
