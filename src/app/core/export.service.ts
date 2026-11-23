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

  /** ids = ressources affichées ; la feuille des heures travaillées est toujours complète. */
  affaireRessources(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/ressources.xlsx`, { ids });
  }

  affaireExpenses(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/expenses.xlsx`, { ids });
  }

  /** Historique des taux d'avancement (onglet WIP d'une affaire au forfait). */
  /** Tableau sous l'histogramme de la vue d'ensemble : filtres du graphique + ce que montre
   *  le tableau (graphique, séries, cumulé, ligne pointillée, ordre des lignes). */
  affaireChartTable(affaireId: number, body: {
    from: string | null; to: string | null; granularity: string; includeTs: boolean;
    statuses: string[]; view: string; selection: string[]; cumul: boolean;
    target: number | null; targetLabel: string | null; keys: string[]; withTotal: boolean;
  }): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/export/chart-table.xlsx`, body);
  }

  avHistory(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/wip/export/av-history.xlsx`, { ids });
  }

  tsHistory(affaireId: number, tsId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/wip/export/ts/${tsId}/history.xlsx`, { ids });
  }

  /** TS cochés dans la liste de l'onglet TS WIP (ids = tsId, ordre de la liste) :
   *  feuille Synthèse + feuille Historique de leurs déclarations. */
  tsSelection(affaireId: number, tsIds: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/wip/export/ts-selection.xlsx`, { ids: tsIds });
  }

  // ── File d'approbation DF (/finance/billing/approval) ───────────────────────────

  /** Onglet DF : ids affichés de chaque tableau, dans l'ordre de l'écran — une feuille par tableau. */
  billingApprovalDf(ids: {
    forfaitLines: number[]; forfaitCreditNotes: number[]; regieLines: number[]; regieCreditNotes: number[];
    livrableBatches: number[]; livrableCreditNotes: number[]; tsLines: number[];
  }): Observable<Blob> {
    return this.post('/billing/pending-df/export.xlsx', ids);
  }

  /** Onglet Historique : entrées du journal affichées. */
  billingApprovalHistory(ids: number[]): Observable<Blob> {
    return this.post('/billing/audit/export.xlsx', { ids });
  }

  // ── Recouvrement (/finance/recouvrement) ────────────────────────────────────────

  /** Balance âgée, paginée côté serveur : filtres et tri envoyés, le serveur exporte toutes
   *  les créances correspondantes — feuilles Créances + Synthèse. Entité = celle de
   *  l'utilisateur, comme GET /payments/aging. */
  aging(filter: {
    affaireId: number | null; clientId: number | null; from: string | null; to: string | null;
    overdueOnly: boolean; search: string | null; sort: string | null;
  }): Observable<Blob> {
    return this.post('/payments/aging/export.xlsx', filter);
  }

  /** Relevé bancaire sélectionné : ses transactions, le relevé et les non-rapprochés. */
  reconciliation(importId: number): Observable<Blob> {
    return this.post(`/bank-reconciliation/imports/${importId}/export.xlsx`, {});
  }

  /** Fiche de recouvrement d'une facture : identité, indicateurs, relances, encaissements. */
  recouvrementDetail(invoiceId: number): Observable<Blob> {
    return this.post(`/invoices/${invoiceId}/recouvrement/export.xlsx`, {});
  }

  // ── Sous-traitance (/finance/subcontracting) ────────────────────────────────────

  /** Onglet Sous-traitants : ids affichés (ordre de l'écran) ; `paysId` en URL. */
  sousTraitants(paysId: number, ids: number[]): Observable<Blob> {
    return this.post('/sous-traitants/export.xlsx', { ids }, { paysId: String(paysId) });
  }

  /** Onglet Ordres ST : ordres affichés de l'affaire, leurs coûts et la synthèse. */
  ordresSt(affaireId: number, ids: number[]): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/ordres-st/export.xlsx`, { ids });
  }

  /** Onglet Analyse des coûts : marge de l'affaire et ses ordres ST. */
  margeSt(affaireId: number): Observable<Blob> {
    return this.post(`/affaires/${affaireId}/marge/export.xlsx`, {});
  }

  // ── Factures (/finance/invoicing) ───────────────────────────────────────────────

  /** Liste paginée côté serveur : on envoie ses filtres et son tri (pas d'ids), le serveur
   * exporte toutes les factures correspondantes — feuilles Factures + Lignes de facturation. */
  invoices(filter: {
    affaireId: number | null; clientId: number | null; statut: string | null; search: string | null;
    from: string | null; to: string | null; dueFrom: string | null; dueTo: string | null;
    minTtc: number | null; maxTtc: number | null; overdueOnly: boolean; sort: string | null;
  }): Observable<Blob> {
    return this.post('/invoices/export.xlsx', filter);
  }

  // ── Affaires (/finance/affaires) ────────────────────────────────────────────────

  /** Liste paginée côté serveur : on envoie ses filtres et son tri (pas d'ids), le serveur
   * exporte toutes les affaires correspondantes — feuilles Affaires + Synthèse. */
  affaires(filter: {
    paysId: number | null; statut: string | null; search: string | null; clientId: number | null;
    responsableId: number | null; billingMode: string | null; clientType: string | null;
    dateDebutFrom: string | null; dateDebutTo: string | null; sort: string | null;
  }): Observable<Blob> {
    // `paysId` en paramètre d'URL : c'est là que PaysIsolationInterceptor le contrôle.
    const { paysId, ...body } = filter;
    return this.post('/affaires/export.xlsx', body, paysId != null ? { paysId: String(paysId) } : {});
  }

  /** Liste des fournisseurs d'une entité — mêmes filtres que GET /suppliers/search ;
   *  `paysId` en paramètre d'URL (contrôlé par PaysIsolationInterceptor), le reste dans le corps. */
  suppliers(paysId: number, filter: {
    search: string | null; status: string | null; typeId: number | null;
    hasIban: boolean | null; hasTva: boolean | null; sort: string | null;
  }): Observable<Blob> {
    return this.post('/suppliers/export.xlsx', filter, { paysId: String(paysId) });
  }

  // ── Clients ─────────────────────────────────────────────────────────────────────

  /** Liste paginée côté serveur : filtres et tri envoyés (pas d'ids), le serveur exporte
   * tous les clients correspondants — feuilles Clients + Synthèse. */
  clients(filter: {
    search: string | null; isActive: boolean | null; isKycDone: boolean | null; sectorCode: string | null;
    countryId: number | null; currency: string | null; hasActiveAffaires: boolean | null;
    clientType: string | null; sort: string | null;
  }): Observable<Blob> {
    return this.post('/clients/export.xlsx', filter);
  }

  /** Fiche client complète (identité, indicateurs, traçabilité + feuille des contacts). */
  clientDetail(clientId: number): Observable<Blob> {
    return this.post(`/clients/${clientId}/export.xlsx`, {});
  }

  // ── Coûts / Fournisseurs ────────────────────────────────────────────────────────

  /** Page /finance/cost : TOUTES les factures de l'entité, le serveur rejoue les filtres de
   *  l'écran (statut, recherche, catégorie, période, montants) et le tri. `paysId` en URL
   *  (contrôlé par PaysIsolationInterceptor), le reste dans le corps. */
  costInvoices(paysId: number, filter: {
    status: string | null; search: string | null; categoryId: number | null;
    dateFrom: string | null; dateTo: string | null;
    amountMin: number | null; amountMax: number | null; sort: string | null;
  }): Observable<Blob> {
    return this.post('/cost-invoices/export.xlsx', filter, { paysId: String(paysId) });
  }

  /** File d'approbation /finance/cost/approval — éléments affichés, ordre de l'écran.
   *  Factures : seul `id` compte (relues en base). Embauches / avances : telles qu'affichées.
   *  `pays` en URL, comme GET /cost/approvals/pending (contrôlé par PaysIsolationInterceptor). */
  costApprovals(paysId: number, items: {
    kind: string; id: number; reference: string | null; title: string | null; date: string | null;
    amount: number | null; currency: string | null; status: string | null; details: string | null;
  }[]): Observable<Blob> {
    return this.post('/cost/approvals/export.xlsx', { items }, { pays: String(paysId) });
  }

  /** Ordres de mission /finance/cost/missions — les missions AFFICHÉES, telles que reçues de
   *  rh-service (la facturation ne peut pas les relire), dans l'ordre de l'écran. */
  missions(missions: unknown[]): Observable<Blob> {
    return this.post('/cost/missions/export.xlsx', { missions });
  }

  /** Avances sur salaire /finance/cost/approval?tab=advances — les avances AFFICHÉES, telles
   *  que reçues de payroll-service (la facturation ne peut pas les relire), dans l'ordre de
   *  l'écran, avec leur échéancier. */
  salaryAdvances(advances: unknown[]): Observable<Blob> {
    return this.post('/cost/salary-advances/export.xlsx', { advances });
  }

  /** Barèmes de taux /finance/cost/rate-computations — tous les barèmes de l'entité et leurs
   *  lignes. `paysId` en URL (contrôlé par PaysIsolationInterceptor). */
  rateComputations(paysId: number): Observable<Blob> {
    return this.post('/rate-computations/export.xlsx', {}, { paysId: String(paysId) });
  }

  /** Vue « Par fournisseur » de /finance/cost : une ligne par fournisseur, totaux EUR. */
  costBySupplier(paysId: number): Observable<Blob> {
    return this.post('/cost-invoices/by-supplier/export.xlsx', {}, { paysId: String(paysId) });
  }

  /** ids = `rowId` des lignes du relevé affichées (−id facture / id règlement). */
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
