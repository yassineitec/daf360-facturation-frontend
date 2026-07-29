import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { forkJoin } from 'rxjs';
import { ClientService } from '../client.service';
import { ClientListItemDto, ClientFilter } from '../client.model';
import { PaysRefDto } from '../../affaires/affaire.model';
import { UserStore } from '../../../core/user.store';
import {
  ButtonComponent, CardComponent, EntityCardComponent, EntityCardOptions, FilterField,
  FilterResult, MetricCardComponent, PaginationComponent, SearchToolbarComponent,
  SearchToolbarFilterConfig,
} from '@khalilrebhiitec/daf360';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AVATAR_BADGE_BG, avatarInitials } from '../../../shared/avatar-palette';

@Component({
  selector: 'app-client-list',
  imports: [
    DecimalPipe, CardComponent, PaginationComponent, ButtonComponent, EntityCardComponent,
    MetricCardComponent, SearchToolbarComponent, TranslatePipe,
  ],
  templateUrl: './client-list.component.html',
  styleUrl: './client-list.component.scss',
})
export class ClientListComponent implements OnInit {
  private readonly svc            = inject(ClientService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly userStore      = inject(UserStore);
  private readonly translate      = inject(TranslateService);

  readonly canViewAllClients = computed(() => this.userStore.hasPermission('FACT_VIEW_ALL_CLIENTS'));

  clients          = signal<ClientListItemDto[]>([]);
  loading          = signal(false);
  error            = signal<string | null>(null);
  totalElements    = signal(0);
  totalPages       = signal(0);
  currentPage      = signal(0);
  paysList         = signal<PaysRefDto[]>([]);
  sectors          = signal<string[]>([]);

  /**
   * Filter state. Signals, not plain fields — `filterFields`/`filterConfig`
   * below are `computed()`, and a computed that reads plain fields never
   * recomputes (which is what left the old status pills stuck on their first
   * value). `searchText` stays a plain field: `daf-search-toolbar` owns the
   * input and pushes changes out through `(valueChange)`.
   */
  searchText = '';
  readonly filterPaysId    = signal(0);
  readonly filterSector    = signal('');
  readonly filterIsActive  = signal<boolean | null>(null);
  readonly filterIsKycDone = signal<boolean | null>(null);

  readonly PAGE_SIZE = 20;

  readonly statsTotal   = computed(() => this.totalElements());
  readonly statsActive  = computed(() => this.clients().filter(c => c.isActive).length);
  readonly statsKycDone = computed(() => this.clients().filter(c => c.isKycDone).length);
  readonly statsTotalCA = computed(() =>
    this.clients().reduce((sum, c) => sum + (c.totalCA ?? 0), 0)
  );
  readonly statsKycPct  = computed(() => {
    const total = this.clients().length;
    return total === 0 ? 0 : Math.round((this.statsKycDone() / total) * 100);
  });

  /** The three status filters collapse into one single-choice panel field. */
  readonly activeFilter = computed<'all' | 'active' | 'pending' | 'kyc'>(() => {
    if (this.filterIsActive()  === true)  return 'active';
    if (this.filterIsActive()  === false) return 'pending';
    if (this.filterIsKycDone() === true)  return 'kyc';
    return 'all';
  });

  /**
   * `daf-entity-card` options per client. Built here rather than inline in the
   * template so the objects are memoised (one per data change instead of one
   * per change-detection cycle) and the label translation stays in one place.
   */
  readonly clientCards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();   // re-translate the labels on language change
    const t = (key: string) => this.translate.instant(key);
    // SEE_FILE already ends in "→"; the card renders its own arrow icon.
    const viewLabel = t('CLIENTS.LIST.CARD.SEE_FILE').replace(/\s*→\s*$/, '');

    return this.clients().map((c, idx) => ({
      id: c.id,
      options: {
        variant: 'glass',
        clickable: true,
        image: {
          initials: avatarInitials(c.clientName),
          badgeBg:  AVATAR_BADGE_BG[idx % AVATAR_BADGE_BG.length],
        },
        metadata: {
          title:    c.clientName,
          subtitle: [c.sector || c.country || '—', c.clientCode].filter(Boolean).join(' · '),
          // One status slot, so the exception wins over the steady state:
          // inactive first, otherwise flag a validated KYC, otherwise no badge.
          ...(!c.isActive
            ? { status: 'inactive', statusLabel: t('CLIENTS.LIST.CARD.INACTIVE') }
            : c.isKycDone
              ? { status: 'active', statusLabel: 'KYC' }
              : {}),
        },
        metrics: [
          { label: t('CLIENTS.LIST.CARD.TOTAL_CA'),         value: this.formatAmount(c.totalCA, c.defaultCurrency ?? 'TND') },
          { label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'),  value: String(c.activeAffaireCount) },
        ],
        metricsColumns: 2,
        viewLabel,
      } satisfies EntityCardOptions,
    }));
  });

  // ── daf-search-toolbar ────────────────────────────────────────────────────
  // Country / sector / status live inside the toolbar's own filter panel rather
  // than next to the search box — that's the layout `daf-search-toolbar`
  // documents, and it replaces the hand-rolled bar plus its mobile-only
  // "Filtres" disclosure toggle, which the component handles responsively.

  /**
   * The FILTER.* labels were written for the old inline layout ("Pays :"), so
   * strip the trailing colon — inside the panel `daf-select` renders its own.
   */
  private label(key: string): string {
    return this.translate.instant(key).replace(/\s*:\s*$/, '');
  }

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const all = this.translate.instant('CLIENTS.LIST.FILTER.ALL');

    const fields: FilterField[] = [
      {
        name: 'pays',
        label: this.label('CLIENTS.LIST.FILTER.COUNTRY'),
        type: 'select',
        searchable: true,
        options: [
          { value: '0', label: all },
          ...this.paysList().map(p => ({ value: String(p.id), label: p.frenchLabel })),
        ],
      },
    ];

    if (this.sectors().length > 0) {
      fields.push({
        name: 'sector',
        label: this.label('CLIENTS.LIST.FILTER.SECTOR'),
        type: 'select',
        searchable: true,
        options: [
          { value: '', label: all },
          ...this.sectors().map(s => ({ value: s, label: s })),
        ],
      });
    }

    fields.push({
      name: 'status',
      label: this.label('CLIENTS.LIST.FILTER.STATUS'),
      type: 'select',
      options: [
        { value: 'all',     label: all },
        { value: 'active',  label: this.translate.instant('CLIENTS.LIST.FILTER.ACTIVE') },
        { value: 'pending', label: this.translate.instant('CLIENTS.LIST.FILTER.INACTIVE') },
        { value: 'kyc',     label: this.translate.instant('CLIENTS.LIST.FILTER.KYC') },
      ],
    });

    return fields;
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    return {
      title:        this.translate.instant('CLIENTS.LIST.FILTER.PANEL_TITLE'),
      triggerLabel: this.translate.instant('CLIENTS.LIST.FILTER.FILTERS'),
      applyLabel:   this.translate.instant('CLIENTS.LIST.FILTER.APPLY'),
      cancelLabel:  this.translate.instant('CLIENTS.LIST.FILTER.CANCEL'),
      align:        'right',
      panelWidth:   300,
      // `daf-filter` seeds a single-select from a string[] (it feeds daf-select's
      // `[selected]`) but emits the scalar back on apply.
      initialValues: {
        pays:   [String(this.filterPaysId())],
        sector: [this.filterSector()],
        status: [this.activeFilter()],
      },
    };
  });

  ngOnInit(): void {
    // Data is no longer scoped by pays — always load the full client list.
    this.loadSectors();
    this.load();

    // Populate the country dropdown for display only; selecting a country no
    // longer filters the data (pays is ignored server-side).
    forkJoin({
      pays:     this.svc.getPays(),
      myPaysId: this.svc.getMyPays(),
    }).subscribe(({ pays, myPaysId }) => {
      this.paysList.set(pays);
      if (pays.length > 0) {
        const userPays = myPaysId != null
          ? (pays.find(p => p.id === myPaysId) ?? pays[0])
          : pays[0];
        this.filterPaysId.set(userPays.id);
      }
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: ClientFilter = {
      paysId:    this.filterPaysId() || 0,
      page:      this.currentPage(),
      size:      this.PAGE_SIZE,
      search:    this.searchText.trim() || null,
      isActive:  this.filterIsActive(),
      isKycDone: this.filterIsKycDone(),
      sector:    this.filterSector() || null,
    };
    this.svc.getClients(filter).subscribe({
      next: res => {
        this.clients.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les clients. Vérifiez votre connexion.');
        this.loading.set(false);
      },
    });
  }

  loadSectors(): void {
    this.svc.getSectors().subscribe(s => this.sectors.set(s));
  }

  /** The toolbar debounces the keystrokes, so this only fires on settled text. */
  onSearchTextChange(text: string): void {
    this.searchText = text;
    this.currentPage.set(0);
    this.load();
  }

  /** One apply from the panel commits every filter at once. */
  applyFilters(result: FilterResult): void {
    this.filterPaysId.set(Number(result['pays'] ?? 0) || 0);
    this.filterSector.set((result['sector'] as string | null) ?? '');

    const status = (result['status'] as string | null) ?? 'all';
    this.filterIsActive.set(status === 'active' ? true : status === 'pending' ? false : null);
    this.filterIsKycDone.set(status === 'kyc' ? true : null);

    this.currentPage.set(0);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.load();
  }

  goToNewClient(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }

  navigateToDetail(id: number): void { this.router.navigate([id], { relativeTo: this.activatedRoute }); }

  formatAmount(v: number | null, currency = 'TND'): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
