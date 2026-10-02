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
import { PaysRefDto, paysLabel } from '../../affaires/affaire.model';
import { TableSort, sortParam } from '../../../shared/table-tools';

/** Activity states the status filter can express, mapped to the backend `isActive` flag. */
type StatusFilter = '' | 'active' | 'inactive';

/** KYC states the KYC filter can express, mapped to the backend `isKycDone` flag. */
type KycFilter = '' | 'done' | 'pending';

/** Affaires en cours — mapped to the backend `hasActiveAffaires` flag. */
type AffairesFilter = '' | 'with' | 'without';

/** Same fixed list as the client form's « Devise par défaut » select. */
const CURRENCY_CODES = ['TND', 'EGP', 'EUR', 'USD'];

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
  /** Référentiel `/ref/pays` — options du filtre « Pays » (pays du client). */
  paysList      = signal<PaysRefDto[]>([]);

  /** `firstLoad` drives the whole-page skeleton, `loading` only the card grid (§5). */
  firstLoad = signal(true);
  loading   = signal(false);

  /** Tri serveur choisi dans l'en-tête du tableau (clé de colonne), `null` = ordre par défaut. */
  readonly sort = signal<TableSort | null>(null);
  searchText   = signal('');
  filterSector = signal('');
  filterStatus = signal<StatusFilter>('');
  /** KYC validé / en attente — sent as `isKycDone`, independent from the activity status. */
  filterKyc    = signal<KycFilter>('');
  /** Pays du CLIENT (`countryId`, id `pays_ref` en chaîne) — sent as `countryId`. */
  filterCountry = signal('');
  /** Devise par défaut du client — sent as `currency`. */
  filterCurrency = signal('');
  /** Avec / sans affaire EN_COURS — sent as `hasActiveAffaires`. */
  filterAffaires = signal<AffairesFilter>('');
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
    // With the « Pays » filter on, the total is that country's — say so instead of « tous pays ».
    const country = this.paysList().find(p => String(p.id) === this.filterCountry());
    if (country) return { value: paysLabel(country, this.translate.currentLang()), direction: 'neutral' };
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
   * ⚠️ The « Pays » filter is the CLIENT's country (`countryId`, an address field), never
   * the entity `paysId`: the list stays un-scoped by pays, which is what avoids the
   * pays-isolation 403 on that endpoint.
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
        ],
      },
      {
        // Split out of « Statut » : the old single select could only ask for « KYC
        // validé », never « KYC en attente » (the clients still to onboard), nor combine
        // KYC with active/inactive — the backend takes both flags independently.
        name: 'kyc',
        label: t('CLIENTS.LIST.FILTER.KYC_STATUS'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        options: [
          { value: 'done',    label: t('CLIENTS.LIST.CARD.KYC_DONE')    },
          { value: 'pending', label: t('CLIENTS.LIST.CARD.KYC_PENDING') },
        ],
      },
      {
        name: 'country',
        label: t('CLIENTS.LIST.CARD.COUNTRY'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        searchable: true,
        options: this.paysList()
          .map(p => ({ value: String(p.id), label: paysLabel(p, this.translate.currentLang()) }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        name: 'currency',
        label: t('CLIENTS.FORM.CURRENCY_LABEL'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        options: CURRENCY_CODES.map(code => ({ value: code, label: t(`CLIENTS.FORM.CURRENCY.${code}`) })),
      },
      {
        name: 'affaires',
        label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'),
        type: 'select',
        placeholder: t('CLIENTS.LIST.FILTER.ALL'),
        options: [
          { value: 'with',    label: t('CLIENTS.LIST.FILTER.WITH_ACTIVE_PROJECTS')    },
          { value: 'without', label: t('CLIENTS.LIST.FILTER.WITHOUT_ACTIVE_PROJECTS') },
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
        kyc:    this.filterKyc()    ? [this.filterKyc()]    : [],
        country:  this.filterCountry()  ? [this.filterCountry()]  : [],
        currency: this.filterCurrency() ? [this.filterCurrency()] : [],
        affaires: this.filterAffaires() ? [this.filterAffaires()] : [],
      },
    };
  });

  ngOnInit(): void {
    this.loadSectors();
    this.svc.getPays().subscribe(list => this.paysList.set(list));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const status = this.filterStatus();
    const kyc    = this.filterKyc();
    const affaires = this.filterAffaires();
    const filter: ClientFilter = {
      page:      this.currentPage(),
      size:      this.pageSize(),
      search:    this.searchText().trim() || null,
      isActive:  status === 'active' ? true : status === 'inactive' ? false : null,
      isKycDone: kyc === 'done' ? true : kyc === 'pending' ? false : null,
      sector:    this.filterSector() || null,
      countryId: this.filterCountry() ? Number(this.filterCountry()) : null,
      currency:  this.filterCurrency() || null,
      hasActiveAffaires: affaires === 'with' ? true : affaires === 'without' ? false : null,
      sort:      sortParam(this.sort()),
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

  /** Nouveau tri d'en-tête → retour à la première page, triée par le serveur. */
  onSortChange(sort: TableSort | null): void {
    this.sort.set(sort);
    this.currentPage.set(0);
    this.load();
  }

  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.load();
  }

  applyFilters(result: FilterResult): void {
    this.filterSector.set((result['sector'] as string | null) ?? '');
    this.filterStatus.set(((result['status'] as string | null) ?? '') as StatusFilter);
    this.filterKyc.set(((result['kyc'] as string | null) ?? '') as KycFilter);
    this.filterCountry.set((result['country'] as string | null) ?? '');
    this.filterCurrency.set((result['currency'] as string | null) ?? '');
    this.filterAffaires.set(((result['affaires'] as string | null) ?? '') as AffairesFilter);
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
