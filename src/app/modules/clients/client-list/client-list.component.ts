import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FieldMessageComponent, FilterField, FilterResult, MetricCardComponent,
  MetricCardOptions,
  MetricDelta, PageComponent, PageHeaderComponent, PaginationComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { ClientService } from '../client.service';
import { ClientFilter, ClientListItemDto } from '../client.model';
import { ClientsCardsSectionComponent } from './clients-cards-section.component';
import { ClientsTableSectionComponent } from './clients-table-section.component';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/** The four states the status filter can express, mapped to the two backend flags. */
type StatusFilter = '' | 'active' | 'inactive' | 'kyc';

/** Meme bascule que la liste des affaires : cartes ou tableau. */
type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-client-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, PaginationComponent, DisplayCurrencyPipe, FieldMessageComponent,
    ClientsCardsSectionComponent, ClientsTableSectionComponent, PermissionDirective,
  ],
  host: { class: 'block' },
  templateUrl: './client-list.component.html',
})
export class ClientListComponent implements OnInit {
  private readonly svc            = inject(ClientService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly translate      = inject(TranslateService);

  clients       = signal<ClientListItemDto[]>([]);
  error         = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  pageSize      = signal(20);
  sectors       = signal<string[]>([]);

  /** `firstLoad` drives the whole-page skeleton, `loading` only the card grid (§5). */
  firstLoad = signal(true);
  loading   = signal(false);

  searchText   = signal('');
  filterSector = signal('');
  filterStatus = signal<StatusFilter>('');
  viewMode     = signal<ViewMode>('grid');

  /** `totalElements` is the real result-set size, so this tile is not page-scoped. */
  readonly statsTotal   = computed(() => this.totalElements());
  readonly statsActive  = computed(() => this.clients().filter(c => c.isActive).length);
  readonly statsKycDone = computed(() => this.clients().filter(c => c.isKycDone).length);
  readonly statsTotalCA = computed(() => this.clients().reduce((sum, c) => sum + (c.totalCA ?? 0), 0));
  readonly statsKycPct  = computed(() => {
    const total = this.clients().length;
    return total === 0 ? 0 : Math.round((this.statsKycDone() / total) * 100);
  });

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiTotal  : MetricCardOptions = { icon: 'group',    iconColor: 'text-primary',   iconBg: 'bg-primary/10'   };
  readonly kpiKyc    : MetricCardOptions = { icon: 'verified', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };
  readonly kpiCa     : MetricCardOptions = { icon: 'payments', iconColor: 'text-teal',      iconBg: 'bg-teal/10'      };
  readonly kpiActive : MetricCardOptions = { icon: 'bolt',     iconColor: 'text-warning',   iconBg: 'bg-warning/10'   };

  readonly deltaAllCountries = computed<MetricDelta>(() => {
    this.translate.currentLang();
    return { value: this.translate.instant('CLIENTS.LIST.KPI.ALL_COUNTRIES'), direction: 'neutral' };
  });

  readonly deltaKyc = computed<MetricDelta>(() => {
    this.translate.currentLang();
    return {
      value: `${this.statsKycDone()} ${this.translate.instant('CLIENTS.LIST.KPI.CLIENTS_SUFFIX')}`,
      direction: 'neutral',
    };
  });

  /** The CA and actifs tiles sum the page on screen — the endpoint returns no aggregates. */
  readonly deltaCurrentPage = computed<MetricDelta>(() => {
    this.translate.currentLang();
    return { value: this.translate.instant('CLIENTS.LIST.KPI.CURRENT_PAGE'), direction: 'neutral' };
  });

  /**
   * Sector and status live *inside* the filter panel — never as loose selects or a
   * pill row next to the search (§1).
   *
   * ⚠️ There is deliberately **no country filter**. `ClientService.getClients` does not
   * send `paysId` at all (the list is not pays-scoped, which is what avoids the
   * pays-isolation 403 on that endpoint), so the old "Pays" dropdown filtered nothing —
   * it only cost two extra requests per page load to populate itself.
   */
  /** Cartes ou tableau — mêmes icônes et mêmes intitulés que la liste des affaires. */
  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('CLIENTS.LIST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('CLIENTS.LIST.VIEW_LIST') },
    ];
  });

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        name: 'sector',
        label: t('CLIENTS.LIST.FILTER.SECTOR'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        options: this.sectors().map(s => ({ value: s, label: s })),
      },
      {
        name: 'status',
        label: t('CLIENTS.LIST.FILTER.STATUS'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        options: [
          { value: 'active',   label: t('CLIENTS.LIST.FILTER.ACTIVE')   },
          { value: 'inactive', label: t('CLIENTS.LIST.FILTER.INACTIVE') },
          { value: 'kyc',      label: t('CLIENTS.LIST.FILTER.KYC')      },
        ],
      },
    ];
  });

  /**
   * `daf-filter` **seeds** `initialValues` once, in the panel's internal shape — a
   * `select` is a `string[]` there and only normalises to a scalar on emit (§10b).
   */
  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('CLIENTS.LIST.FILTER.PANEL_TITLE'),
      applyLabel:   t('CLIENTS.LIST.FILTER.APPLY'),
      cancelLabel:  t('CLIENTS.LIST.FILTER.CANCEL'),
      resetLabel:   t('CLIENTS.LIST.FILTER.RESET'),
      triggerLabel: t('CLIENTS.LIST.FILTER.FILTERS'),
      initialValues: {
        sector: this.filterSector() ? [this.filterSector()] : [],
        status: this.filterStatus() ? [this.filterStatus()] : [],
      },
    };
  });

  ngOnInit(): void {
    this.loadSectors();
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const status = this.filterStatus();
    const filter: ClientFilter = {
      page:      this.currentPage(),
      size:      this.pageSize(),
      search:    this.searchText().trim() || null,
      isActive:  status === 'active' ? true : status === 'inactive' ? false : null,
      isKycDone: status === 'kyc' ? true : null,
      sector:    this.filterSector() || null,
    };
    this.svc.getClients(filter).subscribe({
      next: res => {
        this.clients.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('CLIENTS.LIST.LOAD_ERROR'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  loadSectors(): void {
    this.svc.getSectors().subscribe(s => this.sectors.set(s));
  }

  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.load();
  }

  applyFilters(result: FilterResult): void {
    this.filterSector.set((result['sector'] as string | null) ?? '');
    this.filterStatus.set(((result['status'] as string | null) ?? '') as StatusFilter);
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

  goToNewClient(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }

  navigateToDetail(id: number): void {
    this.router.navigate([id], { relativeTo: this.activatedRoute });
  }
}
