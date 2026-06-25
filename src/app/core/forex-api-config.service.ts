import { Injectable, inject } from '@angular/core';
import { HttpClient }         from '@angular/common/http';
import { Observable }         from 'rxjs';
import { environment }        from '../../environments/environment';

export interface ForexRefreshResultDto {
  success: boolean;
  ratesUpdated: number;
  message: string;
  refreshedAt: string;
}

export interface ForexApiStatusDto {
  provider: string;
  autoRefresh: boolean;
  targetCurrencies: string;
  hasApiKey: boolean;
  lastRefreshAt: string | null;
  lastRefreshStatus: string | null;
}

@Injectable({ providedIn: 'root' })
export class ForexApiConfigService {
  private readonly base = `${environment.factApiUrl}/api/fact/admin/forex`;
  private readonly http = inject(HttpClient);

  refresh(): Observable<ForexRefreshResultDto> {
    return this.http.post<ForexRefreshResultDto>(`${this.base}/refresh`, {});
  }

  getStatus(): Observable<ForexApiStatusDto> {
    return this.http.get<ForexApiStatusDto>(`${this.base}/status`);
  }
}
