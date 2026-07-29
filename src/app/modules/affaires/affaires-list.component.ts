import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { AffaireService } from './affaire.service';
import { AffaireListItem, AffaireFilter, TYPE_LABELS, STATUT_LABELS } from './affaire.model';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, EntityCardComponent, EntityCardOptions, FilterField, FilterResult,
  MetricCardComponent, PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig,
} from '@khalilrebhiitec/daf360';
import { AVATAR_BADGE_BG, avatarInitials } from '../../shared/avatar-palette';

@Component({
  selector: 'app-affaires-list',
  imports: [
    TranslatePipe, ButtonComponent, EntityCardComponent, MetricCardComponent,
    PaginationComponent, SearchToolbarComponent,
  ],
  templateUrl: './affaires-list.component.html',
  styleUrl: './affaires-list.component.scss',
})
export class AffairesListComponent implements OnInit {
  private readonly svc            = inject(AffaireService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly translate      = inject(TranslateService);

  affaires      = signal<AffaireListItem[]>([]);
  loading       = signal(false);
  error         = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);

  /**
   * Filter state. Signals, not plain fields — `filterFields`/`filterConfig`
   * below are `computed()` and a computed that reads plain fields never
   * recomputes. `searchText` stays a plain field: `daf-search-toolbar` owns the
   * input and pushes changes out through `(valueChange)`.
   */
  searchText = '';
  readonly filterStatut = signal('');
  readonly filterType   = signal('');

  readonly PAGE_SIZE = 20;

  readonly statsActives     = computed(() => this.affaires().filter(a => a.statut === 'EN_COURS').length);
  readonly statsSuspendu    = computed(() => this.affaires().filter(a => a.statut === 'SUSPENDUE').length);
  readonly statsRafTotal    = computed(() => this.affaires().reduce((s, a) => s + (a.rafDisponible ?? 0), 0));
  readonly statsBudgetTotal = computed(() => this.affaires().reduce((s, a) => s + (a.budgetPrevisionnel ?? 0), 0));

  /** `statut` → the entity card's three-state status slot. */
  private readonly STATUS_SLOT: Record<string, 'active' | 'pending' | 'inactive'> = {
    EN_COURS:  'active',
    DRAFT:     'pending',
    SUSPENDUE: 'pending',
    CLOTUREE:  'inactive',
    ARCHIVEE:  'inactive',
  };

  typeLabel(type: string): string { return TYPE_LABELS[type] ?? type; }

  /**
   * `daf-entity-card` options per affaire — same card as the clients board.
   * Built here (not inline in the template) so the objects are memoised per
   * data change instead of per change-detection cycle.
   */
  readonly affaireCards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();   // re-translate the labels on language change
    const t = (key: string) => this.translate.instant(key);
    const viewLabel = t('AFFAIRES.LIST.TABLE.SEE_DETAIL');

    return this.affaires().map((a, idx) => ({
      id: a.id,
      options: {
        variant: 'glass',
        clickable: true,
        image: {
          // Initials of the responsable — mirrors the manager avatar the table showed.
          initials: avatarInitials(a.responsableFullName),
          badgeBg:  AVATAR_BADGE_BG[idx % AVATAR_BADGE_BG.length],
        },
        metadata: {
          title:       a.intitule,
          subtitle:    [a.reference, a.clientName, this.typeLabel(a.typeAffaire)].filter(Boolean).join(' · '),
          status:      this.STATUS_SLOT[a.statut] ?? 'pending',
          statusLabel: t(STATUT_LABELS[a.statut] ?? a.statut),
        },
        metrics: [
          { label: t('AFFAIRES.LIST.TABLE.HEADERS.BUDGET'), value: this.formatAmount(a.budgetPrevisionnel), unit: a.devise ?? 'TND' },
          { label: t('AFFAIRES.LIST.TABLE.HEADERS.RAF'),    value: this.formatAmount(a.rafDisponible),      unit: a.devise ?? 'TND' },
        ],
        metricsColumns: 2,
        viewLabel,
      } satisfies EntityCardOptions,
    }));
  });

  // ── daf-search-toolbar ────────────────────────────────────────────────────
  // Statut / type live inside the toolbar's own filter panel rather than next to
  // the search box — that's the layout `daf-search-toolbar` documents, and it
  // replaces the hand-rolled bar this page carried since the table was removed.

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const all = this.translate.instant('CLIENTS.LIST.FILTER.ALL');
    return [
      {
        name: 'statut',
        label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.STATUS'),
        type: 'select',
        options: [
          { value: '', label: all },
          ...Object.entries(STATUT_LABELS).map(([k, v]) => ({ value: k, label: this.translate.instant(v) })),
        ],
      },
      {
        name: 'type',
        label: this.translate.instant('AFFAIRES.LIST.TABLE.HEADERS.TYPE'),
        type: 'select',
        options: [
          { value: '', label: all },
          ...Object.entries(TYPE_LABELS).map(([k, v]) => ({ value: k, label: v })),
        ],
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    return {
      title:        this.translate.instant('AFFAIRES.LIST.TABLE.FILTER_TITLE'),
      triggerLabel: this.translate.instant('AFFAIRES.LIST.TABLE.FILTERS'),
      applyLabel:   this.translate.instant('AFFAIRES.LIST.TABLE.FILTER_APPLY'),
      cancelLabel:  this.translate.instant('AFFAIRES.LIST.TABLE.FILTER_CANCEL'),
      align:        'right',
      panelWidth:   300,
      // `daf-filter` seeds a single-select from a string[] (it feeds daf-select's
      // `[selected]`) but emits the scalar back on apply. Read here rather than
      // hardcoded so an incoming ?statut= shows up pre-selected in the panel.
      initialValues: {
        statut: [this.filterStatut()],
        type:   [this.filterType()],
      },
    };
  });

  ngOnInit(): void {
    // Honor a ?statut= filter passed in (e.g. "Reprendre un brouillon" → statut=DRAFT).
    const statut = this.activatedRoute.snapshot.queryParamMap.get('statut');
    if (statut) this.filterStatut.set(statut);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: AffaireFilter = {
      page:   this.currentPage(),
      size:   this.PAGE_SIZE,
      search: this.searchText.trim() || null,
      statut: this.filterStatut()    || null,
      type:   this.filterType()      || null,
    };
    this.svc.getAffaires(filter).subscribe({
      next: res => {
        this.affaires.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les affaires. Vérifiez votre connexion.');
        this.loading.set(false);
      },
    });
  }

  /** The toolbar debounces the keystrokes, so this only fires on settled text. */
  onSearchTextChange(text: string): void {
    this.searchText = text;
    this.currentPage.set(0);
    this.load();
  }

  /** One apply from the panel commits every filter at once. */
  applyFilters(result: FilterResult): void {
    this.filterStatut.set((result['statut'] as string | null) ?? '');
    this.filterType.set((result['type'] as string | null) ?? '');
    this.currentPage.set(0);
    this.load();
  }

  goToPage(page: number): void {
    if (page < 0 || page >= this.totalPages()) return;
    this.currentPage.set(page);
    this.load();
  }

  navigateToDetail(id: number): void {
    this.router.navigate([id], { relativeTo: this.activatedRoute });
  }

  openNewForm(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }

  formatAmount(v: number | null | undefined): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(v);
  }
}
