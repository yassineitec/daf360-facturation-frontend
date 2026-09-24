import { Component, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, MetricCardComponent, MetricCardOptions,
  PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { CostService } from '../cost.service';
import { COST_STATUS_CONFIG, CostLineDto, SupplierCostSummaryDto, costCategoryDisplay } from '../cost.model';
import { ClientService } from '../../clients/client.service';
import { statusKey } from '../cost-display';
import { CostLinesCardsSectionComponent } from './cost-lines-cards-section.component';
import { CostLinesTableSectionComponent } from './cost-lines-table-section.component';
import { CostSupplierCardsSectionComponent } from './cost-supplier-cards-section.component';
import { ReglementModalComponent } from '../modals/reglement-modal.component';

type ViewMode = 'grid' | 'list' | 'supplier';

@Component({
  selector: 'app-cost-lines',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, MetricCardComponent, PaginationComponent,
    SearchToolbarComponent, CostLinesCardsSectionComponent, CostLinesTableSectionComponent,
    CostSupplierCardsSectionComponent, ReglementModalComponent,
  ],
  host: { class: 'block' },
  templateUrl: './cost-lines.component.html',
})
export class CostLinesComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);

  paysId = signal<number>(0);
  lines  = signal<CostLineDto[]>([]);
  total  = signal(0);
  page   = signal(0);
  size   = signal(25);

  statusFilter    = signal('');
  categoryFilter  = signal('');
  /** Client-side only, like categoryFilter -- CostLineController.list() has neither a
   *  date-range nor an amount-range param. */
  dateRangeFilter = signal<Date[] | null>(null);
  amountMinFilter = signal('');
  amountMaxFilter = signal('');
  searchText      = signal('');
  viewMode        = signal<ViewMode>('grid');

  /** "By supplier" cards view (2026-09-09 plan) -- loaded lazily, the first time the
   *  toggle switches to 'supplier', not on every ngOnInit. `supplierSummariesLoaded`
   *  (not `.length === 0`) is what gates re-fetching -- mirrors step-lines.component.ts's
   *  own categoriesLoaded pattern, so a pays with genuinely zero cost lines for any
   *  supplier doesn't re-fetch every time the toggle switches back to 'supplier'. */
  supplierSummaries        = signal<SupplierCostSummaryDto[]>([]);
  supplierSummariesLoading = signal(false);
  supplierSummariesLoaded  = signal(false);

  isLoading   = signal(false);
  serverError = signal<string | null>(null);
  actionError = signal<string | null>(null);

  @ViewChild('reglementModal') private reglementModal!: ReglementModalComponent;

  /**
   * Passed to both sections as an input rather than each rebuilding it, so the card and
   * the table can never label a category differently. The label travels on the line
   * itself (CostLineDto.costCategoryLabel, resolved server-side from the single category
   * source) — no second lookup against a separate category table.
   */
  readonly categoryFor = (line: CostLineDto): string => costCategoryDisplay(line);

  /**
   * Category filter options = the categories present on the loaded lines. The filter is
   * client-side over the loaded page anyway, and taking them from the lines guarantees
   * every option matches something (a line created before a country overrode a global
   * category still carries the global row's id).
   */
  private readonly lineCategories = computed(() => {
    const seen = new Map<number, string>();
    for (const l of this.lines()) {
      if (l.costCategoryId != null && !seen.has(l.costCategoryId)) {
        seen.set(l.costCategoryId, l.costCategoryLabel ?? String(l.costCategoryId));
      }
    }
    return [...seen].map(([value, label]) => ({ value: String(value), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Client-side over the loaded page — the endpoint takes `status` but no free text, no
   *  category, no date range and no amount range. Same limit as the search box: only the
   *  current page is filtered, not the full result set (`CostLineController.list()` has
   *  none of `categoryId`/date-range/amount-range params yet). */
  readonly visibleLines = computed<CostLineDto[]>(() => {
    const q = this.searchText().toLowerCase().trim();
    const cat = this.categoryFilter();
    const [dateFrom, dateTo] = this.dateRangeBounds();
    const amountMin = this.amountMinFilter() ? Number(this.amountMinFilter()) : null;
    const amountMax = this.amountMaxFilter() ? Number(this.amountMaxFilter()) : null;
    return this.lines()
      .filter(l => !cat || l.costCategoryId === +cat)
      .filter(l => !q || (l.label ?? '').toLowerCase().includes(q) || (l.reference ?? '').toLowerCase().includes(q))
      .filter(l => {
        if (!dateFrom && !dateTo) return true;
        if (!l.transactionDate) return false;
        const d = new Date(l.transactionDate);
        return (!dateFrom || d >= dateFrom) && (!dateTo || d <= dateTo);
      })
      .filter(l => {
        if (amountMin == null && amountMax == null) return true;
        const amount = l.grossAmountLocal;
        if (amount == null) return false;
        return (amountMin == null || amount >= amountMin) && (amountMax == null || amount <= amountMax);
      });
  });

  /** `daterange` emits a 2-element `[start, end]` array (or null) -- the end bound is
   *  widened to the end of its day so "01/09 - 05/09" includes lines dated 05/09. */
  private dateRangeBounds(): [Date | null, Date | null] {
    const range = this.dateRangeFilter();
    if (!range || range.length < 2) return [null, null];
    const [from, to] = range;
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    return [from, end];
  }

  draftCount    = computed(() => this.lines().filter(l => l.status === 'DRAFT').length);
  pendingCount  = computed(() => this.lines().filter(l => l.status === 'SUBMITTED').length);
  approvedCount = computed(() =>
    this.lines().filter(l => ['APPROVED', 'VALIDATED', 'POSTED'].includes(l.status)).length,
  );

  readonly totalPagesCount = computed(() => Math.ceil(this.total() / this.size()) || 1);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiDrafts   : MetricCardOptions = { icon: 'edit_note',        iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiPending  : MetricCardOptions = { icon: 'pending_actions',  iconColor: 'text-warning', iconBg: 'bg-warning/10' };
  readonly kpiApproved : MetricCardOptions = { icon: 'check_circle',     iconColor: 'text-teal',    iconBg: 'bg-teal/10'    };

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid',     icon: 'grid_view',  tooltip: this.translate.instant('COST.LINES.VIEW_GRID') },
      { id: 'list',     icon: 'table_rows', tooltip: this.translate.instant('COST.LINES.VIEW_LIST') },
      { id: 'supplier', icon: 'store',      tooltip: this.translate.instant('COST.LINES.VIEW_SUPPLIER') },
    ];
  });

  /** Status lives *inside* the filter panel — never as a loose select (§1). */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        name: 'status',
        label: t('COST.LINES.STATUS_FILTER_LABEL'),
        type: 'select',
        placeholder: t('COST.LINES.STATUS_FILTER_PLACEHOLDER'),
        // Keys, not COST_STATUS_CONFIG's hardcoded French labels.
        options: Object.keys(COST_STATUS_CONFIG).map(value => ({ value, label: t(statusKey(value)) })),
      },
      {
        name: 'category',
        label: t('COST.LINES.CATEGORY_FILTER_LABEL'),
        type: 'select',
        placeholder: t('COST.LINES.CATEGORY_FILTER_PLACEHOLDER'),
        searchable: true,
        options: this.lineCategories(),
      },
      {
        name: 'dateRange',
        label: t('COST.LINES.DATE_RANGE_FILTER_LABEL'),
        type: 'daterange',
      },
      {
        name: 'amountMin',
        label: t('COST.LINES.AMOUNT_MIN_FILTER_LABEL'),
        type: 'text',
        placeholder: t('COST.LINES.AMOUNT_MIN_FILTER_PLACEHOLDER'),
      },
      {
        name: 'amountMax',
        label: t('COST.LINES.AMOUNT_MAX_FILTER_LABEL'),
        type: 'text',
        placeholder: t('COST.LINES.AMOUNT_MAX_FILTER_PLACEHOLDER'),
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('COST.LINES.FILTERS'),
      applyLabel:   t('COST.LINES.FILTER_APPLY'),
      cancelLabel:  t('COST.LINES.FILTER_CANCEL'),
      resetLabel:   t('COST.LINES.FILTER_RESET'),
      triggerLabel: t('COST.LINES.FILTERS'),
      // Seeded once, in the panel's internal shape — a select is a string[] (§10b).
      initialValues: {
        status:     this.statusFilter()   ? [this.statusFilter()]   : [],
        category:   this.categoryFilter() ? [this.categoryFilter()] : [],
        dateRange:  this.dateRangeFilter(),
        amountMin:  this.amountMinFilter(),
        amountMax:  this.amountMaxFilter(),
      },
    };
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.load();
        } else {
          this.serverError.set(this.translate.instant('COST.LINES.NO_PAYS'));
        }
      },
      error: () => this.serverError.set(this.translate.instant('COST.LINES.NO_PAYS_DETERMINE')),
    });
  }

  load(): void {
    if (!this.paysId()) return;
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.getCostLines({
      paysId: this.paysId(),
      status: this.statusFilter() || null,
      page:   this.page(),
      size:   this.size(),
    }).subscribe({
      next: p => {
        this.lines.set(p.content);
        this.total.set(p.totalElements);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.LINES.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  applyFilters(result: FilterResult): void {
    this.statusFilter.set((result['status'] as string | null) ?? '');
    this.categoryFilter.set((result['category'] as string | null) ?? '');
    this.dateRangeFilter.set((result['dateRange'] as Date[] | null) ?? null);
    this.amountMinFilter.set((result['amountMin'] as string | null) ?? '');
    this.amountMaxFilter.set((result['amountMax'] as string | null) ?? '');
    this.page.set(0);
    this.load();
  }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPagesCount()) return;
    this.page.set(p);
    this.load();
  }

  /** `pageSizeChange` fires alone — the page decides to go back to the first page (§7). */
  onPageSize(size: number): void {
    this.size.set(size);
    this.page.set(0);
    this.load();
  }

  openCreate(): void { this.router.navigate(['new'], { relativeTo: this.route }); }
  openEdit(line: CostLineDto): void { this.router.navigate([line.id, 'edit'], { relativeTo: this.route }); }

  /** Lazily loads the by-supplier aggregation the first time the toggle switches to
   *  'supplier' -- not on every ngOnInit, since the flat grid/list views never need it. */
  setViewMode(mode: ViewMode): void {
    this.viewMode.set(mode);
    if (mode === 'supplier' && !this.supplierSummariesLoaded() && !this.supplierSummariesLoading()) {
      this.loadSupplierSummaries();
    }
  }

  private loadSupplierSummaries(): void {
    if (!this.paysId()) return;
    this.supplierSummariesLoading.set(true);
    this.svc.getCostLinesBySupplier(this.paysId()).subscribe({
      next: rows => {
        this.supplierSummaries.set(rows);
        this.supplierSummariesLoading.set(false);
        this.supplierSummariesLoaded.set(true);
      },
      error: () => {
        this.supplierSummariesLoading.set(false);
        this.supplierSummariesLoaded.set(true);
      },
    });
  }

  /** Navigates to the dual/triple-mode detail page. `null` means the "Sans
   *  fournisseur" pseudo-card, routed to the literal `supplier/none` path. */
  openSupplierCard(supplierId: number | null): void {
    this.router.navigate(['supplier', supplierId ?? 'none'], { relativeTo: this.route });
  }

  submitLine(line: CostLineDto): void {
    this.actionError.set(null);
    this.svc.submitCostLine(line.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err.error?.message ?? this.translate.instant('COST.LINES.SUBMIT_ERROR')),
    });
  }

  openReglementForLine(line: CostLineDto): void {
    this.reglementModal.open({ editing: null, payableLines: [line] }, () => this.load());
  }
}
