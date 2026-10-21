import { Injectable, WritableSignal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { TranslateService } from '@ngx-translate/core';
import { environment } from '../../environments/environment';
import { ToastService } from './toast.service';
import { readBlobError, saveBlob } from '../shared/blob-download';

/**
 * Exports Excel « tableau » générés par le backend (AffaireExportController,
 * CostExportController…) — remplacent les `XLSX.writeFile` / CSV faits dans le navigateur.
 *
 * Contrat commun : on envoie les ids des lignes AFFICHÉES, dans l'ordre de l'écran (après
 * recherche, filtres et tri) ; le serveur relit ces lignes en base et les écrit dans cet ordre.
 * La langue part en `?lang=` pour les en-têtes et libellés.
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly http = inject(HttpClient);
  private readonly translate = inject(TranslateService);
  private readonly toast = inject(ToastService);
  private readonly base = `${environment.factApiUrl}/api/fact`;

  // ── Fiche affaire ───────────────────────────────────────────────────────────────

  affaireTs(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/ts.xlsx`, { ids });
  }

  affaireInvoices(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/invoices.xlsx`, { ids });
  }

  affairePayments(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/payments.xlsx`, { ids });
  }

  /** `emails` = collaborateurs affichés ; les autres champs rejouent les filtres de lignes
   * (période, pays, disciplines) dont dépendent leurs totaux. */
  affaireDepense(affaireId: number, body: {
    emails: string[]; dateFrom: string | null; dateTo: string | null; pays: string[]; disciplines: string[];
  }): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/depense.xlsx`, body);
  }

  tsHistory(affaireId: number, tsId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/wip/export/ts/${tsId}/history.xlsx`, { ids });
  }

  // ── Coûts / Fournisseurs ────────────────────────────────────────────────────────

  /** ids = `reglementId` des lignes du relevé affichées. */
  supplierLedger(supplierId: number, ids: number[]): Observable<Blob> {
    return this.post(`/suppliers/${supplierId}/cost-ledger/export.xlsx`, { ids });
  }

  supplierInvoices(supplierId: number, paysId: number, ids: number[]): Observable<Blob> {
    return this.post(`/suppliers/${supplierId}/cost-invoices/export.xlsx`, { ids }, { paysId: String(paysId) });
  }

  employeeCosts(ids: number[]): Observable<Blob> {
    return this.post('/employee-costs/export.xlsx', { ids });
  }

  /** ids = entrées d'audit affichées ; `who` ne sert qu'au nom du fichier. */
  employeeCostHistory(costId: number, ids: number[], who: string | null): Observable<Blob> {
    return this.post(`/employee-costs/${costId}/audit/export.xlsx`, { ids }, who ? { who } : {});
  }

  /** Revérifie le fichier (dryRun, rien n'est enregistré) et renvoie ses fournisseurs absents. */
  missingSuppliers(file: File, paysId: number): Observable<Blob> {
    const form = new FormData();
    form.append('file', file);
    form.append('paysId', String(paysId));
    return this.http.post(`${this.base}/cost-invoices/import/missing-suppliers.xlsx`, form, {
      params: { lang: this.lang() }, responseType: 'blob', withCredentials: true,
    });
  }

  // ── Téléchargement ──────────────────────────────────────────────────────────────

  /** Lance l'export, enregistre le fichier sous `filename`, remonte une erreur en toast.
   * `busy` (facultatif) passe à true le temps de la requête — pour l'état de chargement du
   * bouton et pour ignorer un double clic. */
  download(request: Observable<Blob>, filename: string, busy?: WritableSignal<boolean>): void {
    if (busy?.()) return;
    busy?.set(true);
    request.subscribe({
      next: blob => {
        busy?.set(false);
        saveBlob(blob, filename);
      },
      error: err => {
        busy?.set(false);
        readBlobError(err, this.translate.instant('COMMON.EXPORT_ERROR'))
          .then(msg => this.toast.error(msg));
      },
    });
  }

  private post(path: string, body: unknown, params: Record<string, string> = {}): Observable<Blob> {
    return this.http.post(`${this.base}${path}`, body, {
      params: { ...params, lang: this.lang() }, responseType: 'blob', withCredentials: true,
    });
  }

  private lang(): string {
    return this.translate.currentLang() || 'fr';
  }
}
