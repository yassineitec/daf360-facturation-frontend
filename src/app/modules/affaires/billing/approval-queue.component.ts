import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { RouterLink, Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService }    from '@ngx-translate/core';
import { forkJoin, Observable, switchMap }    from 'rxjs';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig, TableAction, TableRow,
  PageComponent, PageHeaderComponent, MetricCardComponent, MetricCardOptions,
  TabsComponent, TabItem, PaginationComponent,
  StatusBadgeComponent, BadgeVariant,
  FormFieldComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, FilterField, FilterResult,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';
import {
  BillingService,
  PendingJalonDto, PendingBillingLineDto, PendingLivrableBatchDto,
  PendingCreditNoteDto, AuditLogEntryDto,
} from './billing.service';
// Not a BillingLine like the three sources above — a credit note already IS an Invoice
// (submitted directly at creation), so validating/returning one goes through the
// ordinary invoicing lifecycle endpoints instead of BillingService.
import { InvoiceService } from '../../invoicing/invoice.service';
import { CREDIT_NOTE_REASONS } from '../../invoicing/invoice.model';
type ActiveTab = 'df' | 'history';
type DfSubTab  = 'lines' | 'livrable' | 'creditNotes';

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
    TabsComponent, StatusBadgeComponent, FormFieldComponent, PaginationComponent,
    SearchToolbarComponent,
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

  @ViewChild('dfRetourTpl') private dfRetourTpl!: TemplateRef<unknown>;

  // Mirrors first-load skeleton pattern used elsewhere (see CostApprovalQueueComponent) —
  // only the very first fetch shows the daf-page skeleton, tab switches never do.
  firstLoad     = signal(true);
  activeTab     = signal<ActiveTab>('df');
  activeDfSubTab = signal<DfSubTab>('lines');
  dfLoading     = signal(false);
  histLoading   = signal(false);

  // ── Per-sub-tab search + filter state — each of the 4 "df" tables owns its own
  // text/filter, kept independent of the others (switching tabs must not bleed one
  // table's search into another's rows). A single shared daf-search-toolbar instance
  // isn't reused across tabs (see the .html): daf-filter seeds its internal state
  // from `initialValues` only once per component instance, so swapping `filterFields`
  // under a live instance wouldn't reset stale field keys from the previous tab. ──
  tauxSearch            = signal('');
  tauxFilter            = signal<FilterResult>({});
  lineSearch            = signal('');
  lineFilter            = signal<FilterResult>({});
  livrableBatchSearch   = signal('');
  livrableBatchFilter   = signal<FilterResult>({});
  creditNoteSearch      = signal('');
  creditNoteFilter      = signal<FilterResult>({});

  pendingJalons = signal<PendingJalonDto[]>([]);
  pendingLines  = signal<PendingBillingLineDto[]>([]);
  pendingLivrableBatches = signal<PendingLivrableBatchDto[]>([]);
  pendingCreditNotes     = signal<PendingCreditNoteDto[]>([]);
  auditLog      = signal<AuditLogEntryDto[]>([]);

  dfRetourMotif = signal('');
  dfRetourError = signal<string | null>(null);
  private dfRetourRef?: ModalRef;
  private dfRetourEntityId = 0;
  private dfRetourType: 'line' | 'livrableBatch' | 'creditNote' = 'line';

  readonly kpiRfOptions: MetricCardOptions = { icon: 'pending_actions', iconBg: 'bg-warning/10', iconColor: 'text-warning' };
  readonly kpiDfOptions: MetricCardOptions = { icon: 'task_alt', iconBg: 'bg-tertiary/10', iconColor: 'text-tertiary' };
  readonly kpiHistoryOptions: MetricCardOptions = { icon: 'history', iconBg: 'bg-teal/10', iconColor: 'text-teal' };

  readonly dfCount = computed(() =>
    this.pendingLines().length + this.pendingLivrableBatches().length + this.pendingCreditNotes().length
  );

  readonly tabItems = computed<TabItem[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'df',      label: this.translate.instant('AFFAIRES.billing.approval.tab_df'),      icon: 'task_alt', count: this.dfCount() || null },
      { id: 'history', label: this.translate.instant('AFFAIRES.billing.approval.tab_history'), icon: 'history' },
    ];
  });

  // ── "df" sub-strip (daf-tabs, variant="pill") — the 3 pending-item tables used to sit
  // stacked one under the other; each now lives in its own panel, same pattern as
  // CostConfigComponent's nested section/list-type strips. AV taux no longer has a tab of
  // its own here — see loadDF()'s comment below. ──
  readonly dfSubTabItems = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'lines',       label: t('AFFAIRES.billing.approval.tab_lines'),             icon: 'receipt_long', count: this.pendingLines().length || null },
      { id: 'livrable',    label: t('AFFAIRES.billing.approval.tab_livrable_batches'),  icon: 'folder_copy',  count: this.pendingLivrableBatches().length || null },
      { id: 'creditNotes', label: t('AFFAIRES.billing.approval.tab_credit_notes'),      icon: 'request_quote', count: this.pendingCreditNotes().length || null },
    ];
  });

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

  // Options derived from the pending rows themselves rather than hardcoded — `mode` is
  // a free-form string server-side and `statut` is expected to sit at EN_ATTENTE_DF for
  // everything in this list, so guessing a fixed enum here would drift from reality.
  readonly lineFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const modes   = [...new Set(this.pendingLines().map(l => l.mode).filter(Boolean))];
    const statuts = [...new Set(this.pendingLines().map(l => l.statut).filter(Boolean))];
    return [
      {
        name:    'mode',
        label:   this.translate.instant('AFFAIRES.billing.approval.filter_mode'),
        type:    'select',
        options: modes.map(m => ({ value: m, label: m })),
      },
      {
        name:    'statut',
        label:   this.translate.instant('AFFAIRES.billing.approval.filter_statut'),
        type:    'select',
        options: statuts.map(s => ({ value: s, label: this.lineStatusLabel(s) })),
      },
    ];
  });

  readonly lineFilterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: this.lineFilter(),
    };
  });

  onLineSearch(value: string): void {
    this.lineSearch.set(value);
    this.linePage.set(0);
  }

  onLineFilterApply(result: FilterResult): void {
    this.lineFilter.set(result);
    this.linePage.set(0);
  }

  readonly filteredLineRows = computed(() => {
    const q      = this.lineSearch().trim().toLowerCase();
    const filter = this.lineFilter();
    const mode   = filter['mode'] as string | null;
    const statut = filter['statut'] as string | null;
    return this.lineRows().filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule} ${r.reference}`.toLowerCase().includes(q)) return false;
      if (mode && r._raw.mode !== mode) return false;
      if (statut && r._raw.statut !== statut) return false;
      return true;
    });
  });

  linePage     = signal(0);
  linePageSize = signal(10);
  readonly lineTotalPages = computed(() => Math.ceil(this.filteredLineRows().length / this.linePageSize()));
  readonly pagedLineRows = computed(() => {
    const rows = this.filteredLineRows();
    const size = this.linePageSize();
    const page = Math.min(this.linePage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

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

  readonly livrableBatchFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name:  'billingDate',
      label: this.translate.instant('AFFAIRES.billing.approval.filter_billing_date'),
      type:  'daterange',
    }];
  });

  readonly livrableBatchFilterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: this.livrableBatchFilter(),
    };
  });

  onLivrableBatchSearch(value: string): void {
    this.livrableBatchSearch.set(value);
    this.livrableBatchPage.set(0);
  }

  onLivrableBatchFilterApply(result: FilterResult): void {
    this.livrableBatchFilter.set(result);
    this.livrableBatchPage.set(0);
  }

  readonly filteredLivrableBatchRows = computed(() => {
    const q     = this.livrableBatchSearch().trim().toLowerCase();
    const range = this.livrableBatchFilter()['billingDate'] as Date[] | null;
    return this.livrableBatchRows().filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule}`.toLowerCase().includes(q)) return false;
      if (range?.length === 2) {
        const d = new Date(r._raw.billingDate);
        if (d < range[0] || d > range[1]) return false;
      }
      return true;
    });
  });

  livrableBatchPage     = signal(0);
  livrableBatchPageSize = signal(10);
  readonly livrableBatchTotalPages = computed(() => Math.ceil(this.filteredLivrableBatchRows().length / this.livrableBatchPageSize()));
  readonly pagedLivrableBatchRows = computed(() => {
    const rows = this.filteredLivrableBatchRows();
    const size = this.livrableBatchPageSize();
    const page = Math.min(this.livrableBatchPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

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

  readonly creditNoteFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name:    'motif',
      label:   this.translate.instant('AFFAIRES.billing.approval.filter_motif'),
      type:    'select',
      options: Object.entries(CREDIT_NOTE_REASONS).map(([value, key]) => ({
        value, label: this.translate.instant(key),
      })),
    }];
  });

  readonly creditNoteFilterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:         t('AFFAIRES.billing.approval.filter_title'),
      applyLabel:    t('AFFAIRES.billing.approval.filter_apply'),
      cancelLabel:   t('AFFAIRES.billing.approval.filter_cancel'),
      resetLabel:    t('AFFAIRES.billing.approval.filter_reset'),
      align:         'right',
      initialValues: this.creditNoteFilter(),
    };
  });

  onCreditNoteSearch(value: string): void {
    this.creditNoteSearch.set(value);
    this.creditNotePage.set(0);
  }

  onCreditNoteFilterApply(result: FilterResult): void {
    this.creditNoteFilter.set(result);
    this.creditNotePage.set(0);
  }

  readonly filteredCreditNoteRows = computed(() => {
    const q     = this.creditNoteSearch().trim().toLowerCase();
    const motif = this.creditNoteFilter()['motif'] as string | null;
    return this.creditNoteRows().filter(r => {
      if (q && !`${r.affaireRef} ${r.affaireIntitule} ${r.reference}`.toLowerCase().includes(q)) return false;
      if (motif && r._raw.creditNoteReason !== motif) return false;
      return true;
    });
  });

  creditNotePage     = signal(0);
  creditNotePageSize = signal(10);
  readonly creditNoteTotalPages = computed(() => Math.ceil(this.filteredCreditNoteRows().length / this.creditNotePageSize()));
  readonly pagedCreditNoteRows = computed(() => {
    const rows = this.filteredCreditNoteRows();
    const size = this.creditNotePageSize();
    const page = Math.min(this.creditNotePage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

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

  historyPage     = signal(0);
  historyPageSize = signal(10);
  readonly historyTotalPages = computed(() => Math.ceil(this.historyRows().length / this.historyPageSize()));
  readonly pagedHistoryRows = computed(() => {
    const rows = this.historyRows();
    const size = this.historyPageSize();
    const page = Math.min(this.historyPage(), Math.max(0, Math.ceil(rows.length / size) - 1));
    return rows.slice(page * size, page * size + size);
  });

  readonly tableConfig = computed<TableConfig>(() => ({ hoverable: true, showHeader: false }));

  // ── Row action buttons — rendered as icon buttons in a trailing column by
  // daf-data-table itself (config.actions), same as the library demo's table. ──
  private validateAction(onClick: (row: TableRow) => void): TableAction {
    return {
      id: 'validate', icon: 'check_circle',
      tooltip: this.translate.instant('AFFAIRES.billing.approval.validate'),
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

  readonly lineTableConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      hoverable: true,
      showHeader: false,
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
      showHeader: false,
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
      showHeader: false,
      actions: [
        this.validateAction(row => this.doValidateCreditNote(row['id'])),
        this.returnAction(row => this.openDfRetourModal(row['id'], 'creditNote')),
      ],
    };
  });

  ngOnInit(): void {
    // Jalons no longer have a tab of their own, but the "En attente RF" KPI still
    // needs a count — fetched once here, independent of which tab is active.
    this.loadRF();
    this.loadDF();
  }

  onTabChange(id: string): void {
    const tab = id as ActiveTab;
    this.activeTab.set(tab);
    this.setTab(tab);
  }

  onDfSubTabChange(id: string): void {
    this.activeDfSubTab.set(id as DfSubTab);
  }

  /**
   * Row click on either of the two tables (line, livrable) opens the detail page for
   * that item.
   *
   * No leading `..`: this component sits on the `approval` route's *empty-path* child, which
   * doesn't add a navigation hop of its own — so `this.route` already resolves at the
   * `approval` level, and `[type, id]` reaches its sibling `:type/:id` route directly. A
   * leading `..` here overshoots past `approval` to `billing`, producing `billing/line/1`
   * instead of `billing/approval/line/1` (a 404) — confirmed live 2026-08-24.
   */
  openDetail(row: { id: number }, type: 'line' | 'livrable'): void {
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
    if (tab === 'df')      this.loadDF();
    if (tab === 'history') this.loadHistory();
  }

  /** Feeds only the "En attente RF" KPI now — jalons have no tab of their own. */
  private loadRF(): void {
    this.svc.getPendingJalons().subscribe({ next: j => this.pendingJalons.set(j) });
  }

  /** AV taux no longer have a queue of their own — a taux's BillingLine appears in
   * pendingLines below exactly like every other mode, once the client has confirmed an
   * amount (see docs/superpowers/specs/2026-09-21-av-client-confirmation-design.md). */
  private loadDF(): void {
    this.dfLoading.set(true);
    forkJoin({
      livrableBatches: this.svc.getPendingLivrableBatches(),
      lines: this.svc.getPendingDFLines(),
      creditNotes: this.svc.getPendingCreditNotes(),
    }).subscribe({
      next: ({ livrableBatches, lines, creditNotes }) => {
        this.pendingLivrableBatches.set(livrableBatches);
        this.pendingLines.set(lines);
        this.pendingCreditNotes.set(creditNotes);
        this.dfLoading.set(false);
        this.firstLoad.set(false);
      },
      error: () => { this.dfLoading.set(false); this.firstLoad.set(false); },
    });
  }

  private loadHistory(): void {
    this.histLoading.set(true);
    this.svc.getAuditLog().subscribe({
      next:  a => { this.auditLog.set(a); this.histLoading.set(false); },
      error: () => this.histLoading.set(false),
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
