import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { FormsModule }                        from '@angular/forms';
import { TranslatePipe, TranslateService }    from '@ngx-translate/core';
import { forkJoin, Observable }               from 'rxjs';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';
import {
  BillingService,
  PendingTauxDto, PendingJalonDto, PendingBillingLineDto, PendingLivrableBatchDto, AuditLogEntryDto,
} from './billing.service';

type ActiveTab = 'rf' | 'df' | 'history';

const LINE_STATUT: Record<string, { bg: string; color: string; border: string }> = {
  EN_ATTENTE_DF: { bg: '#fef3c7', color: '#92400e', border: '#fcd34d' },
  VALIDE_DF:     { bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  FACTURE:       { bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  RETOURNE:      { bg: '#ffedd5', color: '#9a3412', border: '#fdba74' },
  ANNULE:        { bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
};

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [RouterLink, FormsModule, TranslatePipe, DataTableComponent, DafCellDirective],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(BillingService);
  private readonly translate = inject(TranslateService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  readonly tabs = computed<{ key: ActiveTab; label: string; icon: string }[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'rf',      label: this.translate.instant('AFFAIRES.billing.approval.tab_rf'),      icon: 'approval' },
      { key: 'df',      label: this.translate.instant('AFFAIRES.billing.approval.tab_df'),      icon: 'task_alt' },
      { key: 'history', label: this.translate.instant('AFFAIRES.billing.approval.tab_history'), icon: 'history'  },
    ];
  });

  activeTab   = signal<ActiveTab>('rf');
  rfLoading   = signal(false);
  dfLoading   = signal(false);
  histLoading = signal(false);

  pendingTaux   = signal<PendingTauxDto[]>([]);
  pendingJalons = signal<PendingJalonDto[]>([]);
  pendingLines  = signal<PendingBillingLineDto[]>([]);
  pendingLivrableBatches = signal<PendingLivrableBatchDto[]>([]);
  auditLog      = signal<AuditLogEntryDto[]>([]);

  showRfRefuseModal = signal(false);
  rfRefuseMotif     = '';
  private rfRefuseId   = 0;
  private rfRefuseType: 'taux' | 'jalon' = 'taux';

  showDfRetourModal = signal(false);
  dfRetourMotif     = '';
  private dfRetourEntityId = 0;
  private dfRetourType: 'line' | 'livrableBatch' = 'line';

  // ── daf-data-table: Taux d'avancement (RF) ──────────────────────────────────
  readonly tauxColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire', label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'), type: 'custom' },
      { key: 'taux',    label: this.translate.instant('AFFAIRES.billing.approval.col_taux'),    type: 'custom', align: 'right' },
      { key: 'valeur',  label: this.translate.instant('AFFAIRES.billing.approval.col_valeur'),  type: 'custom', align: 'right' },
      { key: 'soumis',  label: this.translate.instant('AFFAIRES.billing.approval.col_soumis'),  type: 'custom' },
      { key: '_actions',label: '',                                                              type: 'custom', align: 'right', width: '180px' },
    ];
  });

  readonly tauxRows = computed(() =>
    this.pendingTaux().map(t => ({
      id:              t.id,
      affaireId:       t.affaireId,
      affaireRef:      t.affaireRef,
      affaireIntitule: t.affaireIntitule,
      taux:            t.tauxSaisi,
      valeur:          this.fmtAmt(t.montantIncremental),
      soumis:          this.fmtDate(t.submittedAt),
      _raw:            t,
    }))
  );

  // ── daf-data-table: Jalons (RF) ──────────────────────────────────────────────
  readonly jalonColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',  label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'),  type: 'custom' },
      { key: 'label',    label: this.translate.instant('AFFAIRES.billing.approval.col_jalon'),    type: 'text' },
      { key: 'montant',  label: this.translate.instant('AFFAIRES.billing.approval.col_montant'),  type: 'custom', align: 'right' },
      { key: 'echeance', label: this.translate.instant('AFFAIRES.billing.approval.col_echeance'), type: 'custom' },
      { key: '_actions', label: '',                                                               type: 'custom', align: 'right', width: '180px' },
    ];
  });

  readonly jalonRows = computed(() =>
    this.pendingJalons().map(j => ({
      id:              j.id,
      affaireId:       j.affaireId,
      affaireRef:      j.affaireRef,
      affaireIntitule: j.affaireIntitule,
      label:           j.label,
      montant:         this.fmtAmt(j.montant),
      echeance:        this.fmtDate(j.datePrevisionnelle),
      _raw:            j,
    }))
  );

  // ── daf-data-table: Billing lines (DF) ───────────────────────────────────────
  readonly lineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',   label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'),    type: 'custom' },
      { key: 'reference', label: this.translate.instant('AFFAIRES.billing.approval.col_reference'),  type: 'custom' },
      { key: 'periode',   label: this.translate.instant('AFFAIRES.billing.approval.col_periode'),    type: 'custom' },
      { key: 'montantHt', label: this.translate.instant('AFFAIRES.billing.approval.col_montant_ht'), type: 'custom', align: 'right' },
      { key: 'mode',      label: this.translate.instant('AFFAIRES.billing.approval.col_mode'),        type: 'custom' },
      { key: 'statut',    label: this.translate.instant('AFFAIRES.billing.approval.col_statut'),      type: 'custom' },
      { key: '_actions',  label: '',                                                                  type: 'custom', align: 'right', width: '200px' },
    ];
  });

  readonly lineRows = computed(() =>
    this.pendingLines().map(line => ({
      id:              line.id,
      affaireId:       line.affaireId,
      affaireRef:      line.affaireRef,
      affaireIntitule: line.affaireIntitule,
      reference:       line.reference,
      periode:         line.periode,
      montantHt:       this.fmtAmt(line.montantHt),
      mode:            line.mode,
      statut:          line.statut,
      _raw:            line,
    }))
  );

  // ── daf-data-table: Livrable batches (DF) ────────────────────────────────────
  readonly livrableBatchColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',     label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'), type: 'custom' },
      { key: 'documents',   label: this.translate.instant('AFFAIRES.billing.approval.col_documents'), type: 'custom', align: 'right' },
      { key: 'montant',     label: this.translate.instant('AFFAIRES.billing.approval.col_montant'), type: 'custom', align: 'right' },
      { key: 'billingDate', label: this.translate.instant('AFFAIRES.billing.approval.col_date'), type: 'custom' },
      { key: '_actions',    label: '',                                                             type: 'custom', align: 'right', width: '200px' },
    ];
  });

  readonly livrableBatchRows = computed(() =>
    this.pendingLivrableBatches().map(b => ({
      id:              b.batchId,
      affaireId:       b.affaireId,
      affaireRef:      b.affaireRef,
      affaireIntitule: b.affaireIntitule,
      documents:       b.documentCount,
      montant:         this.fmtAmt(b.combinedMontant),
      billingDate:     this.fmtDate(b.billingDate),
      _raw:            b,
    }))
  );

  // ── daf-data-table: Audit history ────────────────────────────────────────────
  readonly historyColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'createdAt',   label: this.translate.instant('AFFAIRES.billing.approval.col_date'),    type: 'custom' },
      { key: 'userNom',     label: this.translate.instant('AFFAIRES.billing.approval.col_user'),    type: 'custom' },
      { key: 'action',      label: this.translate.instant('AFFAIRES.billing.approval.col_action'),  type: 'custom' },
      { key: 'entity',      label: this.translate.instant('AFFAIRES.billing.approval.col_entity'),  type: 'custom' },
      { key: 'commentaire', label: this.translate.instant('AFFAIRES.billing.approval.col_comment'), type: 'custom' },
    ];
  });

  readonly historyRows = computed(() =>
    this.auditLog().map(entry => ({
      id:          entry.id,
      createdAt:   this.fmtDateTime(entry.createdAt),
      userNom:     entry.userNom,
      action:      entry.action,
      entity:      `${entry.entityType} #${entry.entityId}`,
      commentaire: entry.commentaire,
    }))
  );

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: true }));

  ngOnInit(): void { this.loadRF(); }

  /**
   * Row click on any of the three tables opens the detail page for that item.
   *
   * No leading `..`: this component sits on the `approval` route's *empty-path* child, which
   * doesn't add a navigation hop of its own — so `this.route` already resolves at the
   * `approval` level, and `[type, id]` reaches its sibling `:type/:id` route directly. A
   * leading `..` here overshoots past `approval` to `billing`, producing `billing/taux/1`
   * instead of `billing/approval/taux/1` (a 404) — confirmed live 2026-08-24.
   */
  openDetail(row: { id: number }, type: 'taux' | 'jalon' | 'line' | 'livrable'): void {
    this.router.navigate([type, String(row.id)], { relativeTo: this.route });
  }

  setTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'rf')      this.loadRF();
    if (tab === 'df')      this.loadDF();
    if (tab === 'history') this.loadHistory();
  }

  private loadRF(): void {
    this.rfLoading.set(true);
    this.svc.getPendingJalons().subscribe({
      next:  j => { this.pendingJalons.set(j); this.rfLoading.set(false); },
      error: () => this.rfLoading.set(false),
    });
  }

  // AV taux live here now, not under RF — validating one is a DF action (see
  // ProgressBillingService.validateTaux()).
  private loadDF(): void {
    this.dfLoading.set(true);
    forkJoin({
      taux: this.svc.getPendingTaux(),
      livrableBatches: this.svc.getPendingLivrableBatches(),
      lines: this.svc.getPendingDFLines(),
    }).subscribe({
      next: ({ taux, livrableBatches, lines }) => {
        this.pendingTaux.set(taux);
        this.pendingLivrableBatches.set(livrableBatches);
        this.pendingLines.set(lines);
        this.dfLoading.set(false);
      },
      error: () => this.dfLoading.set(false),
    });
  }

  private loadHistory(): void {
    this.histLoading.set(true);
    this.svc.getAuditLog().subscribe({
      next:  a => { this.auditLog.set(a); this.histLoading.set(false); },
      error: () => this.histLoading.set(false),
    });
  }

  doValidateTaux(id: number): void {
    // Validating a taux creates the invoice server-side (ProgressBillingService), emitted
    // immediately — jump straight into its detail page, same as doValidateDF() below.
    this.svc.validateTaux(id).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId]);
        } else {
          this.loadDF();
        }
      },
    });
  }

  doValidateJalon(id: number): void {
    this.svc.validateJalon(id).subscribe({ next: () => this.loadRF() });
  }

  openRfRefuseModal(id: number, type: 'taux' | 'jalon'): void {
    this.rfRefuseId   = id;
    this.rfRefuseType = type;
    this.rfRefuseMotif = '';
    this.showRfRefuseModal.set(true);
  }

  submitRfRefuse(): void {
    if (!this.rfRefuseMotif.trim()) return;
    const motif = this.rfRefuseMotif.trim();
    if (this.rfRefuseType === 'taux') {
      this.svc.refuseTaux(this.rfRefuseId, motif).subscribe({
        next: () => { this.showRfRefuseModal.set(false); this.loadDF(); },
      });
    } else {
      this.svc.refuseJalon(this.rfRefuseId, motif).subscribe({
        next: () => { this.showRfRefuseModal.set(false); this.loadRF(); },
      });
    }
  }

  doValidateDF(lineId: number): void {
    // DF validation creates the invoice server-side (DFValidationService), emitted
    // immediately — jump straight into its detail page instead of staying on this list,
    // since there's nothing left to do here once the invoice exists.
    this.svc.validateDF(lineId).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId]);
        } else {
          this.loadDF();
        }
      },
    });
  }

  doValidateLivrableBatch(batchId: number): void {
    this.svc.validateLivrableBatch(batchId).subscribe({
      next: batch => {
        if (batch.invoiceId) {
          this.router.navigate(['/finance/invoicing', batch.invoiceId]);
        } else {
          this.loadDF();
        }
      },
    });
  }

  openDfRetourModal(entityId: number, type: 'line' | 'livrableBatch' = 'line'): void {
    this.dfRetourEntityId = entityId;
    this.dfRetourType = type;
    this.dfRetourMotif = '';
    this.showDfRetourModal.set(true);
  }

  submitDfRetour(): void {
    if (!this.dfRetourMotif.trim()) return;
    const motif = this.dfRetourMotif.trim();
    // Typed Observable<unknown> rather than letting each branch's own return type stand —
    // a union of BillingLineDto/LivrableBatchDto observables isn't callable in this
    // TS/RxJS combination (differently-parameterized Observable overloads don't unify),
    // and both branches' follow-up is identical anyway.
    const request$: Observable<unknown> = this.dfRetourType === 'livrableBatch'
      ? this.svc.returnLivrableBatch(this.dfRetourEntityId, motif)
      : this.svc.returnDF(this.dfRetourEntityId, motif);
    request$.subscribe({
      next: () => { this.showDfRetourModal.set(false); this.loadDF(); },
    });
  }

  lineCfg(statut: string) {
    const c = LINE_STATUT[statut];
    if (!c) return { label: statut, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
    return { ...c, label: this.translate.instant('AFFAIRES.billing.status.' + statut) };
  }

  fmtAmt(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v);
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  fmtDateTime(d: string): string {
    return new Date(d).toLocaleString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }
}
