import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, MetricCardComponent, MetricCardOptions,
  PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { CostService } from '../cost.service';
import { COST_STATUS_CONFIG, CostCategoryDto, CostLineDto } from '../cost.model';
import { ClientService } from '../../clients/client.service';
import { statusKey } from '../cost-display';
import { CostLinesCardsSectionComponent } from './cost-lines-cards-section.component';
import { CostLinesTableSectionComponent } from './cost-lines-table-section.component';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-cost-lines',
  standalone: true,
  imports: [
    TranslatePipe, ButtonComponent, MetricCardComponent, PaginationComponent,
    SearchToolbarComponent, CostLinesCardsSectionComponent, CostLinesTableSectionComponent,
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

  statusFilter = signal('');
  searchText   = signal('');
  viewMode     = signal<ViewMode>('grid');

  isLoading   = signal(false);
  serverError = signal<string | null>(null);
  actionError = signal<string | null>(null);

  categories  = signal<CostCategoryDto[]>([]);
  categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.labelFr])));

  /**
   * Passed to both sections as an input rather than each rebuilding the lookup, so the
   * card and the table can never label a category differently.
   */
  readonly categoryFor = (id: number | null): string => {
    if (id == null) return '—';
    return this.categoryMap().get(id)
      ?? this.translate.instant('COST.LINES.CAT_FALLBACK', { id });
  };

  /** Client-side over the loaded page — the endpoint takes `status` but no free text. */
  readonly visibleLines = computed<CostLineDto[]>(() => {
    const q = this.searchText().toLowerCase().trim();
    if (!q) return this.lines();
    return this.lines().filter(l =>
      (l.label ?? '').toLowerCase().includes(q) || (l.reference ?? '').toLowerCase().includes(q),
    );
  });

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
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.LINES.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.LINES.VIEW_LIST') },
    ];
  });

  /** Status lives *inside* the filter panel — never as a loose select (§1). */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [{
      name: 'status',
      label: t('COST.LINES.STATUS_FILTER_LABEL'),
      type: 'select',
      placeholder: t('COST.LINES.STATUS_FILTER_PLACEHOLDER'),
      // Keys, not COST_STATUS_CONFIG's hardcoded French labels.
      options: Object.keys(COST_STATUS_CONFIG).map(value => ({ value, label: t(statusKey(value)) })),
    }];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('COST.LINES.STATUS_FILTER_LABEL'),
      applyLabel:   t('COST.LINES.FILTER_APPLY'),
      cancelLabel:  t('COST.LINES.FILTER_CANCEL'),
      resetLabel:   t('COST.LINES.FILTER_RESET'),
      triggerLabel: t('COST.LINES.FILTERS'),
      // Seeded once, in the panel's internal shape — a select is a string[] (§10b).
      initialValues: { status: this.statusFilter() ? [this.statusFilter()] : [] },
    };
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.load();
          this.svc.getCategories(paysId).subscribe({
            next: cats => this.categories.set(cats),
            error: () => {},
          });
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

  submitLine(line: CostLineDto): void {
    this.actionError.set(null);
    this.svc.submitCostLine(line.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err.error?.message ?? this.translate.instant('COST.LINES.SUBMIT_ERROR')),
    });
  }
}
