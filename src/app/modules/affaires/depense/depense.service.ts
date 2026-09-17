import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, of } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { DepensePreview } from './depense.model';

const EMPTY_PREVIEW: DepensePreview = { totalHours: 0, totalCost: 0, collaboratorCount: 0, lignes: [] };

@Injectable({ providedIn: 'root' })
export class DepenseService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.factApiUrl}/api/fact`;
  private readonly opts = { withCredentials: true };

  getDepense(affaireId: number): Observable<DepensePreview> {
    return this.http.get<DepensePreview>(`${this.base}/affaires/${affaireId}/depense`, this.opts).pipe(
      catchError(() => of(EMPTY_PREVIEW)),
    );
  }
}
