import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, MetricCardOptions, MetricDelta, PageComponent,
  PageHeaderComponent, PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig,
  MetricCardComponent, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from './affaire.service';
import { AffaireFilter, AffaireListItem, AffairesSummary, STATUT_LABELS } from './affaire.model';
import { distinctResponsables } from './affaire-display';
import { AffairesCardsSectionComponent } from './components/affaires-cards-section.component';
import { AffairesTableSectionComponent } from './components/affaires-table-section.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { EmployeeAvatarService } from '../../core/employee-avatar.service';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-affaires-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, PaginationComponent, DisplayCurrencyPipe,
    AffairesCardsSectionComponent, AffairesTableSectionComponent,
  ],
  // The deleted SCSS carried `:host { display: contents }` so `.affaires-page` could
  // own the flex chain; `daf-page` owns the rhythm now, so the host just needs to be
  // a block box for it to lay out against.
  host: { class: 'block' },
  templateUrl: './affaires-list.component.html',
})
export class AffairesListComponent implements OnInit {
  private readonly svc            = inject(AffaireService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly translate      = inject(TranslateService);
  private readonly avatarSvc      = inject(EmployeeAvatarService);

  /** Photos RH des responsables de la page courante, par `userId`. */
  readonly avatarUrls = signal<Map<number, string>>(new Map());

  /**
   * Libellés des pays par id. Le endpoint de liste ne renvoie que `paysId` ; le
   * référentiel est petit, immuable et mémorisé pour la session par `AffaireService`,
   * donc une seule requête sert la liste entière, les deux vues et les changements de page.
   */
  readonly paysLabels = signal<Map<number, string>>(new Map());

  affaires      = signal<AffaireListItem[]>([]);
  error         = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  pageSize      = signal(20);

  /**
   * Two distinct states (UI-PLAYBOOK §5): `firstLoad` drives `daf-page [loading]`
   * (whole-page skeleton), `loading` drives the section's own skeleton so a search,
   * a filter or a page change never blanks the header and the KPI row.
   */
  firstLoad = signal(true);
  loading   = signal(false);

  searchText   = signal('');
  filterStatut = signal('');
  viewMode     = signal<ViewMode>('grid');

  /**
   * Restriction à un client, passée en `?clientId=` — c'est ce que suit « Voir les
   * affaires » depuis une fiche client. Elle n'est PAS dans le panneau de filtres :
   * elle vient du lien d'arrivée, et un filtre invisible dans le panneau donnerait une
   * liste tronquée sans explication. D'où le bandeau de contexte, avec son bouton pour
   * revenir à la liste complète.
   */
  filterClientId = signal<number | null>(null);
  clientName     = signal<string | null>(null);

  /**
   * Agrégats des tuiles, renvoyés par `GET /affaires/summary` sur l'ENSEMBLE du jeu
   * filtré. Ils étaient auparavant sommés sur `affaires()`, c'est-à-dire sur les 20
   * lignes affichées : « Budget total » changeait donc à chaque page tournée et ne
   * comptait jamais le reste du portefeuille.
   */
  readonly summary = signal<AffairesSummary | null>(null);

  /**
   * Devise des montants renvoyés — 'EUR', converti côté serveur. Elle était codée en
   * dur à 'TND' dans le gabarit : le pipe reconvertissait donc des euros comme s'ils
   * étaient des dinars et affichait un budget divisé par plus de trois.
   */
  readonly summaryCurrency = computed(() => this.summary()?.devise ?? 'EUR');

  readonly statsActives     = computed(() => this.summary()?.actives     ?? 0);
  readonly statsSuspendu    = computed(() => this.summary()?.suspendues  ?? 0);
  readonly statsRafTotal    = computed(() => this.summary()?.rafTotal    ?? 0);
  readonly statsBudgetTotal = computed(() => this.summary()?.budgetTotal ?? 0);

  /**
   * Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4) — the tiles
   * used to be `app-affaire-kpi-card`, which pushed raw `rgba()` / `#ba1a1a` values
   * through `[style]` bindings and carried its own 50 lines of card SCSS.
   */
  readonly kpiActive  : MetricCardOptions = { icon: 'work',                    iconColor: 'text-primary',   iconBg: 'bg-primary/10'   };
  readonly kpiRaf     : MetricCardOptions = { icon: 'account_balance_wallet',  iconColor: 'text-teal',      iconBg: 'bg-teal/10'      };
  readonly kpiBudget  : MetricCardOptions = { icon: 'payments',                iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };
  readonly kpiPending : MetricCardOptions = { icon: 'pause_circle',            iconColor: 'text-warning',   iconBg: 'bg-warning/10'   };

  /** Un filtre est-il actif ? Décide seulement de la légende des tuiles. */
  readonly hasActiveFilter = computed(() =>
    !!this.searchText().trim() || !!this.filterStatut() || this.filterClientId() !== null);

  /**
   * Même légende sur les quatre tuiles. Elle dit sur quoi porte le chiffre — tout le
   * portefeuille, ou la sélection en cours — pour qu'un total qui baisse après un
   * filtre se lise comme un filtre et non comme une perte de données.
   */
  readonly kpiDelta = computed<MetricDelta>(() => {
    this.translate.currentLang();
    const key = this.hasActiveFilter() ? 'AFFAIRES.LIST.KPI.FILTERED' : 'AFFAIRES.LIST.KPI.ALL';
    return { value: this.translate.instant(key), direction: 'neutral' };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('AFFAIRES.LIST.TABLE.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('AFFAIRES.LIST.TABLE.VIEW_LIST') },
    ];
  });

  /** Statut lives *inside* the filter panel — never as a loose select next to the search (§1). */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        name: 'statut',
        label: t('AFFAIRES.LIST.TABLE.HEADERS.STATUS'),
        type: 'select',
        placeholder: t('AFFAIRES.LIST.FILTER_ALL'),
        options: Object.keys(STATUT_LABELS).map(k => ({ value: k, label: t(STATUT_LABELS[k]) })),
      },
    ];
  });

  /**
   * `daf-filter` **seeds** `initialValues` once, and in the panel's internal shape —
   * a `select` is a `string[]` there and only normalises to a scalar on emit (§10b).
   * A bare string reads back as empty and shows a blank control.
   */
  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('AFFAIRES.LIST.TABLE.FILTER_TITLE'),
      applyLabel:   t('AFFAIRES.LIST.TABLE.FILTER_APPLY'),
      cancelLabel:  t('AFFAIRES.LIST.TABLE.FILTER_CANCEL'),
      resetLabel:   t('AFFAIRES.LIST.FILTER_RESET'),
      triggerLabel: t('AFFAIRES.LIST.TABLE.FILTERS'),
      initialValues: {
        statut: this.filterStatut() ? [this.filterStatut()] : [],
      },
    };
  });

  ngOnInit(): void {
    // Honor a ?statut= filter passed in (e.g. "Reprendre un brouillon" → statut=DRAFT).
    const statut = this.activatedRoute.snapshot.queryParamMap.get('statut');
    if (statut) this.filterStatut.set(statut);

    // ?clientId= — arrivée depuis une fiche client. Le nom affiché dans le bandeau vient
    // du paramètre `client`, pour ne pas déclencher un appel de plus juste pour un libellé.
    const clientId = Number(this.activatedRoute.snapshot.queryParamMap.get('clientId'));
    if (Number.isFinite(clientId) && clientId > 0) {
      this.filterClientId.set(clientId);
      this.clientName.set(this.activatedRoute.snapshot.queryParamMap.get('client'));
    }
    this.svc.getPays().subscribe(list =>
      this.paysLabels.set(new Map(list.map(p => [p.id, p.frenchLabel]))));
    this.load();
    this.loadSummary();
  }

  /**
   * Les photos des responsables de la page affichée, en **un seul appel groupé** : ids
   * dédupliqués (le même manager revient sur plusieurs affaires) et service qui mémorise
   * en session, donc changer de page ou revenir ne redemande que ce qui manque.
   *
   * Sans `error` : le service ne rejette jamais, et une photo absente se dégrade en
   * initiales — il n'y a rien à signaler à l'utilisateur.
   */
  private loadResponsableAvatars(rows: AffaireListItem[]): void {
    // Le premier responsable de `affaire_responsables`, et non `responsableUserId` : la
    // colonne de compatibilité peut avoir divergé du principal de la table de jointure
    // (l'assistant réécrit la liste, la colonne ne suit qu'au dernier enregistrement),
    // et la cellule affiche justement ce premier-là — sinon elle demandait la photo de
    // quelqu'un d'autre et retombait sur les initiales.
    const ids = [...new Set(
      rows.flatMap(a => {
        const lead = distinctResponsables(a)[0];
        return lead ? [lead.userId] : (a.responsableUserId ? [a.responsableUserId] : []);
      }).filter((id): id is number => !!id && id > 0),
    )];
    if (ids.length === 0) { this.avatarUrls.set(new Map()); return; }

    this.avatarSvc.resolve(ids).subscribe({
      next: avatars => {
        const urls = new Map<number, string>();
        for (const a of avatars) {
          const url = this.avatarSvc.photoUrl(a);
          if (url) urls.set(a.userId, url);
        }
        this.avatarUrls.set(urls);
      },
    });
  }

  /** Le jeu décrit par les filtres courants, sans la pagination. */
  private currentFilter(): AffaireFilter {
    return {
      search:   this.searchText().trim() || null,
      statut:   this.filterStatut()      || null,
      clientId: this.filterClientId(),
    };
  }

  /**
   * Les tuiles ne dépendent que des filtres, jamais de la page : elles ne sont donc
   * PAS rechargées depuis `goToPage` / `onPageSize`, sous peine d'un appel de plus
   * par page tournée pour un résultat identique.
   *
   * Sans `error` visible : l'échec laisse le dernier total affiché, et l'erreur de la
   * liste (même filtre, même requête) porte déjà le message.
   */
  private loadSummary(): void {
    this.svc.getAffairesSummary(this.currentFilter()).subscribe({
      next: s => this.summary.set(s),
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: AffaireFilter = {
      ...this.currentFilter(),
      page: this.currentPage(),
      size: this.pageSize(),
    };
    this.svc.getAffaires(filter).subscribe({
      next: res => {
        this.affaires.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
        this.firstLoad.set(false);
        this.loadResponsableAvatars(res.content);
      },
      error: () => {
        this.error.set(this.translate.instant('AFFAIRES.LIST.LOAD_ERROR'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  onSearchTextChange(value: string): void {
    this.searchText.set(value);
    this.currentPage.set(0);
    this.load();
    this.loadSummary();
  }

  applyFilters(result: FilterResult): void {
    this.filterStatut.set((result['statut'] as string | null) ?? '');
    this.currentPage.set(0);
    this.load();
    this.loadSummary();
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

  /** Retire la restriction client et recharge la liste complète. */
  clearClientFilter(): void {
    this.filterClientId.set(null);
    this.clientName.set(null);
    this.currentPage.set(0);
    // L'URL est nettoyée aussi : un rechargement de page ne doit pas ramener le filtre.
    this.router.navigate([], {
      relativeTo: this.activatedRoute,
      queryParams: { clientId: null, client: null },
      queryParamsHandling: 'merge',
    });
    this.load();
    this.loadSummary();
  }

  navigateToDetail(id: number): void {
    this.router.navigate([id], { relativeTo: this.activatedRoute });
  }

  openNewForm(): void {
    this.router.navigate(['new'], { relativeTo: this.activatedRoute });
  }
}
