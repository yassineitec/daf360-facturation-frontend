import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService }    from '@ngx-translate/core';
import { forkJoin, Observable, switchMap }    from 'rxjs';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableAction, TableRow,
  PageComponent, PageHeaderComponent, MetricCardComponent, MetricCardOptions,
  TabsComponent, TabItem,
  StatusBadgeComponent, BadgeVariant,
  FormFieldComponent,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';
import {
  BillingService,
  PendingTauxDto, PendingJalonDto, PendingBillingLineDto, PendingLivrableBatchDto,
  PendingCreditNoteDto, AuditLogEntryDto,
} from './billing.service';
// Not a BillingLine like the three sources above — a credit note already IS an Invoice
// (submitted directly at creation), so validating/returning one goes through the
// ordinary invoicing lifecycle endpoints instead of BillingService.
import { InvoiceService } from '../../invoicing/invoice.service';
import { CREDIT_NOTE_REASONS } from '../../invoicing/invoice.model';
type ActiveTab = 'rf' | 'df' | 'history';

const LINE_STATUT_VARIANT: Record<string, BadgeVariant> = {
  EN_ATTENTE_DF: 'warning',
  VALIDE_DF:     'info',
  FACTURE:       'success',
  RETOURNE:      'secondary',
  ANNULE:        'danger',
};

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    RouterLink, TranslatePipe, DataTableComponent, DafCellDirective,
    PageComponent, PageHeaderComponent, MetricCardComponent,
    TabsComponent, StatusBadgeComponent, FormFieldComponent,
  ],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc        = inject(BillingService);
  private readonly invoiceSvc = inject(InvoiceService);
  private readonly translate  = inject(TranslateService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly modal      = inject(ModalService);

  @ViewChild('rfRefuseTpl') private rfRefuseTpl!: TemplateRef<unknown>;
  @ViewChild('dfRetourTpl') private dfRetourTpl!: TemplateRef<unknown>;

  // Mirrors first-load skeleton pattern used elsewhere (see CostApprovalQueueComponent) —
  // only the very first fetch shows the daf-page skeleton, tab switches never do.
  firstLoad   = signal(true);
  activeTab   = signal<ActiveTab>('rf');
  rfLoading   = signal(false);
  dfLoading   = signal(false);
  histLoading = signal(false);

  pendingTaux   = signal<PendingTauxDto[]>([]);
  pendingJalons = signal<PendingJalonDto[]>([]);
  pendingLines  = signal<PendingBillingLineDto[]>([]);
  pendingLivrableBatches = signal<PendingLivrableBatchDto[]>([]);
  pendingCreditNotes     = signal<PendingCreditNoteDto[]>([]);
  auditLog      = signal<AuditLogEntryDto[]>([]);

  rfRefuseMotif = signal('');
  rfRefuseError = signal<string | null>(null);
  private rfRefuseRef?: ModalRef;
  private rfRefuseId   = 0;
  private rfRefuseType: 'taux' | 'jalon' = 'taux';

  dfRetourMotif = signal('');
  dfRetourError = signal<string | null>(null);
  private dfRetourRef?: ModalRef;
  private dfRetourEntityId = 0;
  private dfRetourType: 'line' | 'livrableBatch' | 'creditNote' = 'line';

  readonly kpiRfOptions: MetricCardOptions = { icon: 'pending_actions', iconBg: 'bg-warning/10', iconColor: 'text-warning' };
  readonly kpiDfOptions: MetricCardOptions = { icon: 'task_alt', iconBg: 'bg-tertiary/10', iconColor: 'text-tertiary' };
  readonly kpiHistoryOptions: MetricCardOptions = { icon: 'history', iconBg: 'bg-teal/10', iconColor: 'text-teal' };

  readonly dfCount = computed(() =>
    this.pendingTaux().length + this.pendingLines().length + this.pendingLivrableBatches().length + this.pendingCreditNotes().length
  );

  readonly tabItems = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'rf',      label: this.translate.instant('AFFAIRES.billing.approval.tab_rf'),      icon: 'approval', count: this.pendingJalons().length || null },
      { id: 'df',      label: this.translate.instant('AFFAIRES.billing.approval.tab_df'),      icon: 'task_alt',  count: this.dfCount() || null },
      { id: 'history', label: this.translate.instant('AFFAIRES.billing.approval.tab_history'), icon: 'history' },
    ];
  });

  // ── daf-data-table: Taux d'avancement (RF) ──────────────────────────────────
  readonly tauxColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire', label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'), type: 'custom' },
      { key: 'taux',    label: this.translate.instant('AFFAIRES.billing.approval.col_taux'),    type: 'custom', align: 'right' },
      { key: 'valeur',  label: this.translate.instant('AFFAIRES.billing.approval.col_valeur'),  type: 'custom', align: 'right' },
      { key: 'soumis',  label: this.translate.instant('AFFAIRES.billing.approval.col_soumis'),  type: 'custom' },
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

  // ── daf-data-table: Credit notes / avoirs (DF) ───────────────────────────────
  readonly creditNoteColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'affaire',   label: this.translate.instant('AFFAIRES.billing.approval.col_affaire'),  type: 'custom' },
      { key: 'reference', label: this.translate.instant('AFFAIRES.billing.approval.col_reference'), type: 'custom' },
      { key: 'montant',   label: this.translate.instant('AFFAIRES.billing.approval.col_montant'),  type: 'custom', align: 'right' },
      { key: 'motif',     label: this.translate.instant('AFFAIRES.billing.approval.col_motif'),    type: 'custom' },
      { key: 'soumis',    label: this.translate.instant('AFFAIRES.billing.approval.col_soumis'),   type: 'custom' },
    ];
  });

  readonly creditNoteRows = computed(() =>
    this.pendingCreditNotes().map(cn => ({
      id:              cn.id,
      affaireId:       cn.affaireId,
      affaireRef:      cn.affaireRef,
      affaireIntitule: cn.affaireIntitule,
      reference:       cn.linkedInvoiceNumber ?? '—',
      // Toujours négatif (voir InvoiceService.createCreditNote) — Math.abs pour afficher
      // le montant crédité plutôt qu'un signe qui n'apporte rien à ce stade.
      montant:         this.fmtAmt(Math.abs(cn.montantTtc)),
      motif:           this.creditNoteReasonLabel(cn.creditNoteReason),
      soumis:          this.fmtDate(cn.submittedAt),
      _raw:            cn,
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

  // ── Row action buttons — rendered as icon buttons in a trailing column by
  // daf-data-table itself (config.actions), same as the library demo's table. ──
  private validateAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'validate', icon: 'check_circle',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.validate'),
      onClick,
    };
  }

  private refuseAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'refuse', icon: 'block', variant: 'danger',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.refuse'),
      onClick,
    };
  }

  private returnAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'return', icon: 'undo',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.return'),
      onClick,
    };
  }

  readonly tauxTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      actions: [
        this.validateAction(row => this.doValidateTaux(row['id'])),
        this.refuseAction(row => this.openRfRefuseModal(row['id'], 'taux')),
      ],
    };
  });

  readonly jalonTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      actions: [
        this.validateAction(row => this.doValidateJalon(row['id'])),
        this.refuseAction(row => this.openRfRefuseModal(row['id'], 'jalon')),
      ],
    };
  });

  readonly lineTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      actions: [
        this.validateAction(row => this.doValidateDF(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'])),
      ],
    };
  });

  readonly livrableBatchTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      actions: [
        this.validateAction(row => this.doValidateLivrableBatch(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'], 'livrableBatch')),
      ],
    };
  });

  readonly creditNoteTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      actions: [
        this.validateAction(row => this.doValidateCreditNote(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'], 'creditNote')),
      ],
    };
  });

  ngOnInit(): void { this.loadRF(); }

  onTabChange(id: string): void {
    const tab = id as ActiveTab;
    this.activeTab.set(tab);
    this.setTab(tab);
  }

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

  /** A credit note is a real Invoice, not a billing-module entity with its own detail
   * route here — its row opens the ordinary invoice detail page directly (absolute
   * navigation, unlike openDetail() above which stays relative under this route). */
  openCreditNoteDetail(row: { id: number }): void {
    this.router.navigate(['/finance/invoicing', row.id]);
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
      next:  j => { this.pendingJalons.set(j); this.rfLoading.set(false); this.firstLoad.set(false); },
      error: () => { this.rfLoading.set(false); this.firstLoad.set(false); },
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
      creditNotes: this.svc.getPendingCreditNotes(),
    }).subscribe({
      next: ({ taux, livrableBatches, lines, creditNotes }) => {
        this.pendingTaux.set(taux);
        this.pendingLivrableBatches.set(livrableBatches);
        this.pendingLines.set(lines);
        this.pendingCreditNotes.set(creditNotes);
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
    // Validating a taux creates the draft invoice server-side (ProgressBillingService) —
    // jump straight into its edit stepper, same as doValidateDF() below.
    this.svc.validateTaux(id).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit']);
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
    this.rfRefuseMotif.set('');
    this.rfRefuseError.set(null);
    this.rfRefuseRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_title'),
      body: this.rfRefuseTpl,
      size: 'sm',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),     variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_refuse_btn'), variant: 'primary',   action: () => this.submitRfRefuse() },
      ],
    });
  }

  submitRfRefuse(): void {
    const motif = this.rfRefuseMotif().trim();
    if (!motif) {
      this.rfRefuseError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    // Observable<unknown> — a union of TauxDto/JalonDto observables isn't callable in
    // this TS/RxJS combination (differently-parameterized Observable overloads don't
    // unify), and both branches' follow-up is identical anyway (see submitDfRetour()).
    const request$: Observable<unknown> = this.rfRefuseType === 'taux'
      ? this.svc.refuseTaux(this.rfRefuseId, motif)
      : this.svc.refuseJalon(this.rfRefuseId, motif);
    request$.subscribe({
      next: () => {
        this.rfRefuseRef?.close();
        if (this.rfRefuseType === 'taux') this.loadDF(); else this.loadRF();
      },
    });
  }

  doValidateDF(lineId: number): void {
    // DF validation creates the draft invoice server-side (DFValidationService) — jump
    // straight into its edit stepper instead of staying on this list, since there's
    // nothing left to do here once the invoice exists.
    this.svc.validateDF(lineId).subscribe({
      next: line => {
        if (line.invoiceId) {
          this.router.navigate(['/finance/invoicing', line.invoiceId, 'edit']);
        } else {
          this.loadDF();
        }
      },
    });
  }

  doValidateLivrableBatch(batchId: number): void {
    // Same as doValidateDF() above — the batch's shared invoice is created as a DRAFT
    // (LivrableBillingService → DFValidationService.generateFromBillingLines), so the
    // edit stepper is where DF reviews it, not the read-only detail page.
    this.svc.validateLivrableBatch(batchId).subscribe({
      next: batch => {
        if (batch.invoiceId) {
          this.router.navigate(['/finance/invoicing', batch.invoiceId, 'edit']);
        } else {
          this.loadDF();
        }
      },
    });
  }

  /**
   * A credit note is already a full Invoice (SUBMITTED at creation, see
   * InvoiceService.createCreditNote) — there's no BillingLine here for
   * DFValidationService to turn into one. "Valider" is therefore approve THEN emit,
   * chained the same way createCreditNote_linkedInvoiceSet's fixture data flows
   * server-side, so DF gets the same one-click result as every other row in this tab.
   */
  doValidateCreditNote(id: number): void {
    this.invoiceSvc.approve(id, { decision: 'APPROVE' }).pipe(
      switchMap(() => this.invoiceSvc.emit(id)),
    ).subscribe({
      next: () => this.router.navigate(['/finance/invoicing', id]),
      error: () => this.loadDF(),
    });
  }

  openDfRetourModal(entityId: number, type: 'line' | 'livrableBatch' | 'creditNote' = 'line'): void {
    this.dfRetourEntityId = entityId;
    this.dfRetourType = type;
    this.dfRetourMotif.set('');
    this.dfRetourError.set(null);
    this.dfRetourRef = this.modal.open({
      title: this.translate.instant('AFFAIRES.billing.approval.modal_return_title'),
      body: this.dfRetourTpl,
      size: 'sm',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_cancel'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('AFFAIRES.billing.approval.modal_confirm'), variant: 'primary',   action: () => this.submitDfRetour() },
      ],
    });
  }

  submitDfRetour(): void {
    const motif = this.dfRetourMotif().trim();
    if (!motif) {
      this.dfRetourError.set(this.translate.instant('AFFAIRES.billing.approval.modal_motif_required'));
      return;
    }
    // Typed Observable<unknown> rather than letting each branch's own return type stand —
    // a union of BillingLineDto/LivrableBatchDto/void observables isn't callable in this
    // TS/RxJS combination (differently-parameterized Observable overloads don't unify),
    // and every branch's follow-up is identical anyway.
    const request$: Observable<unknown> = this.dfRetourType === 'livrableBatch'
      ? this.svc.returnLivrableBatch(this.dfRetourEntityId, motif)
      : this.dfRetourType === 'creditNote'
      ? this.invoiceSvc.approve(this.dfRetourEntityId, { decision: 'RETURN', comment: motif })
      : this.svc.returnDF(this.dfRetourEntityId, motif);
    request$.subscribe({
      next: () => { this.dfRetourRef?.close(); this.loadDF(); },
    });
  }

  lineBadgeVariant(statut: string): BadgeVariant {
    return LINE_STATUT_VARIANT[statut] ?? 'neutral';
  }

  lineStatusLabel(statut: string): string {
    return this.translate.instant('AFFAIRES.billing.status.' + statut);
  }

  /** `creditNoteReason` holds one of CREDIT_NOTE_REASONS' codes (see
   * credit-note-modal.component.ts) — translate it, falling back to the raw code for
   * anything unrecognised rather than showing nothing. */
  creditNoteReasonLabel(code: string | null): string {
    if (!code) return '—';
    const key = CREDIT_NOTE_REASONS[code];
    return key ? this.translate.instant(key) : code;
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
