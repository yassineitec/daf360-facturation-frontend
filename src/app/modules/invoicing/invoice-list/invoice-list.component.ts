import { Component, OnInit, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, MetricDelta, ModalRef, ModalService, PageComponent, PageHeaderComponent,
  PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { InvoiceService } from '../invoice.service';
import { INVOICE_STATUT_CONFIG, InvoiceFilter, InvoiceListItem } from '../invoice.model';
import { PENDING_STATUTS, isOverdue } from '../invoice-display';
import { InvoicesCardsSectionComponent } from './invoices-cards-section.component';
import { InvoicesTableSectionComponent } from './invoices-table-section.component';
import { PaymentModalComponent } from '../payment-modal.component';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

type ApprovalDecision = 'APPROVE' | 'RETURN' | 'REJECT';
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-invoice-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, PaginationComponent, DisplayCurrencyPipe, FormFieldComponent,
    InvoicesCardsSectionComponent, InvoicesTableSectionComponent, PaymentModalComponent,
  ],
  host: { class: 'block' },
  templateUrl: './invoice-list.component.html',
})
export class InvoiceListComponent implements OnInit {
  private readonly svc       = inject(InvoiceService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);

  @ViewChild('approvalTpl') approvalTpl!: TemplateRef<unknown>;
  private approvalRef: ModalRef | null = null;

  invoices      = signal<InvoiceListItem[]>([]);
  error         = signal<string | null>(null);
  actionError   = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  pageSize      = signal(20);

  /** `firstLoad` drives the whole-page skeleton, `loading` only the table (§5). */
  firstLoad = signal(true);
  loading   = signal(false);

  searchText      = signal('');
  filterStatut    = signal('');
  filterDateRange = signal<Date[] | null>(null);
  viewMode        = signal<ViewMode>('grid');

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('INVOICING.LIST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('INVOICING.LIST.VIEW_LIST') },
    ];
  });

  paymentTarget    = signal<InvoiceListItem | null>(null);
  approvalTarget   = signal<InvoiceListItem | null>(null);
  approvalDecision = signal<ApprovalDecision>('APPROVE');
  approvalCommentSig = signal('');

  // ── KPI counts / amounts — all scoped to the page on screen ────────────────
  readonly statsEnAttente = computed(() => this.invoices().filter(i => PENDING_STATUTS.includes(i.statut)).length);
  readonly statsEnRetard  = computed(() => this.invoices().filter(i => isOverdue(i)).length);
  readonly statsEnLitige  = computed(() => this.invoices().filter(i => i.statut === 'DISPUTED').length);

  readonly amountTotal     = computed(() => this.invoices().reduce((s, i) => s + (i.montantTtc ?? 0), 0));
  readonly amountEnAttente = computed(() =>
    this.invoices().filter(i => PENDING_STATUTS.includes(i.statut)).reduce((s, i) => s + (i.montantTtc ?? 0), 0));
  readonly amountEnRetard  = computed(() =>
    this.invoices().filter(i => isOverdue(i)).reduce((s, i) => s + (i.montantTtc ?? 0), 0));
  readonly amountEnLitige  = computed(() =>
    this.invoices().filter(i => i.statut === 'DISPUTED').reduce((s, i) => s + (i.montantTtc ?? 0), 0));

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiTotal    : MetricCardOptions = { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiPending  : MetricCardOptions = { icon: 'schedule',     iconColor: 'text-teal',    iconBg: 'bg-teal/10'    };
  readonly kpiOverdue  : MetricCardOptions = {
    icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10',
    valueColor: 'text-danger', deltaColor: 'text-danger',
  };
  readonly kpiDisputed : MetricCardOptions = { icon: 'gavel', iconColor: 'text-warning', iconBg: 'bg-warning/10' };

  /**
   * The three right-hand tiles caption themselves with their own page count, which
   * matches their page-scoped amount. The Total tile used to caption itself with
   * `totalElements` — the full result-set count next to a page-only sum, which read
   * as "this is the portfolio total". It says "page courante" instead; the pagination
   * summary carries the real total.
   */
  readonly deltaCurrentPage = computed<MetricDelta>(() => this.delta('INVOICING.LIST.KPI.CURRENT_PAGE'));
  readonly deltaPending     = computed<MetricDelta>(() => this.countDelta(this.statsEnAttente(), 'INVOICING.LIST.KPI.PENDING_SUFFIX'));
  readonly deltaOverdue     = computed<MetricDelta>(() => this.countDelta(this.statsEnRetard(),  'INVOICING.LIST.KPI.OVERDUE_SUFFIX'));
  readonly deltaDisputed    = computed<MetricDelta>(() => this.countDelta(this.statsEnLitige(),  'INVOICING.LIST.KPI.DISPUTED_SUFFIX'));

  private delta(key: string): MetricDelta {
    this.translate.currentLang();
    return { value: this.translate.instant(key), direction: 'neutral' };
  }

  private countDelta(count: number, suffixKey: string): MetricDelta {
    this.translate.currentLang();
    return { value: `${count} ${this.translate.instant(suffixKey)}`, direction: 'neutral' };
  }

  readonly approvalOptions = computed<{ id: ApprovalDecision; icon: string; label: string }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'APPROVE', icon: 'check_circle', label: t('INVOICING.LIST.APPROVAL.APPROVE') },
      { id: 'RETURN',  icon: 'undo',         label: t('INVOICING.LIST.APPROVAL.RETURN')  },
      { id: 'REJECT',  icon: 'cancel',       label: t('INVOICING.LIST.APPROVAL.REJECT')  },
    ];
  });

  /** Statut and the date range live *inside* the filter panel — never loose next to the search (§1). */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        name: 'statut',
        label: t('INVOICING.LIST.TABLE.STATUS'),
        type: 'select',
        placeholder: t('INVOICING.LIST.FILTER.ALL'),
        options: Object.entries(INVOICE_STATUT_CONFIG).map(([value, cfg]) => ({ value, label: t(cfg.label) })),
      },
      {
        name: 'dates',
        label: t('INVOICING.LIST.FILTER.PERIOD'),
        type: 'daterange',
        placeholder: t('INVOICING.LIST.FILTER.PERIOD_PLACEHOLDER'),
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('INVOICING.LIST.FILTER.PANEL_TITLE'),
      applyLabel:   t('INVOICING.LIST.APPROVAL.CONFIRM'),
      cancelLabel:  t('INVOICING.LIST.APPROVAL.CANCEL'),
      resetLabel:   t('INVOICING.LIST.FILTER.RESET'),
      triggerLabel: t('INVOICING.LIST.FILTER.FILTERS'),
      // Seeded once, in the panel's internal shape — a select is a string[] there (§10b).
      initialValues: {
        statut: this.filterStatut() ? [this.filterStatut()] : [],
        dates:  this.filterDateRange(),
      },
    };
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const range = this.filterDateRange() ?? [];
    const filter: InvoiceFilter = {
      page:   this.currentPage(),
      size:   this.pageSize(),
      statut: this.filterStatut() || null,
      from:   toIsoDate(range[0]),
      to:     toIsoDate(range[1]),
      search: this.searchText().trim() || null,
    };
    this.svc.getInvoices(filter).subscribe({
      next: res => {
        this.invoices.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('INVOICING.LIST.LOAD_ERROR'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.load();
  }

  applyFilters(result: FilterResult): void {
    this.filterStatut.set((result['statut'] as string | null) ?? '');
    const dates = result['dates'];
    this.filterDateRange.set(Array.isArray(dates) ? (dates as Date[]) : null);
    this.currentPage.set(0);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.load();
  }

  /** `pageSizeChange` fires alone — the page decides to go back to the first page (§7). */
  onPageSize(size: number): void {
    this.pageSize.set(size);
    this.currentPage.set(0);
    this.load();
  }

  navigateToDetail(id: number): void { this.router.navigate([id],    { relativeTo: this.route }); }
  navigateToNew():        void { this.router.navigate(['new'], { relativeTo: this.route }); }

  // ── Row quick actions ──────────────────────────────────────────────────────
  quickEmit(item: InvoiceListItem): void {
    this.actionError.set(null);
    this.svc.emit(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('INVOICING.LIST.ERROR.EMIT')),
    });
  }

  quickMarkSent(item: InvoiceListItem): void {
    this.actionError.set(null);
    this.svc.markSent(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('INVOICING.LIST.ERROR.MARK_SENT')),
    });
  }

  openPaymentModal(item: InvoiceListItem): void { this.paymentTarget.set(item); }

  onPaymentDone(saved: boolean): void {
    this.paymentTarget.set(null);
    if (saved) this.load();
  }

  openApprovalModal(item: InvoiceListItem): void {
    this.approvalTarget.set(item);
    this.approvalDecision.set('APPROVE');
    this.approvalCommentSig.set('');
    this.approvalRef = this.modal.open({
      title: this.translate.instant('INVOICING.LIST.APPROVAL.TITLE'),
      body:  this.approvalTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('INVOICING.LIST.APPROVAL.CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('INVOICING.LIST.APPROVAL.CONFIRM'), variant: 'primary',   action: () => this.submitApproval() },
      ],
    });
  }

  submitApproval(): void {
    const item = this.approvalTarget();
    if (!item) return;
    this.svc.approve(item.id, {
      decision: this.approvalDecision(),
      comment:  this.approvalCommentSig().trim() || null,
    }).subscribe({
      next:  () => { this.approvalRef?.close(); this.approvalTarget.set(null); this.load(); },
      error: err => this.actionError.set(err?.error?.message ?? this.translate.instant('INVOICING.LIST.ERROR.APPROVE')),
    });
  }
}

/** `Date` → `YYYY-MM-DD`, the shape `InvoiceFilter.from` / `.to` expect. */
function toIsoDate(d: unknown): string | null {
  return d instanceof Date ? d.toISOString().split('T')[0] : null;
}
