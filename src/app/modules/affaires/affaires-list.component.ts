import { Component, OnInit, inject, signal, computed, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, MetricCardOptions, MetricDelta, PageComponent,
  PageHeaderComponent, PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig,
  MetricCardComponent, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from './affaire.service';
import { AffaireFilter, AffaireListItem, AffairesSummary, PaysRefDto, STATUT_LABELS, paysLabel } from './affaire.model';
import { distinctResponsables } from './affaire-display';
import { AffairesCardsSectionComponent } from './components/affaires-cards-section.component';
import { AffaireSort, AffairesTableSectionComponent } from './components/affaires-table-section.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { EmployeeAvatarService } from '../../core/employee-avatar.service';
import { ClientService } from '../clients/client.service';
import { BILLING_MODES } from './affaire-wizard.model';
import { enumLabel } from '../../shared/enum-labels';

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
  /** Vue tableau uniquement (undefined en vue cartes) — son `daf-data-table` va au `[table]` de la toolbar. */
  readonly tableSection = viewChild(AffairesTableSectionComponent);

  private readonly svc            = inject(AffaireService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly translate      = inject(TranslateService);
  private readonly avatarSvc      = inject(EmployeeAvatarService);
  private readonly clientSvc      = inject(ClientService);

  /** Photos RH des responsables de la page courante, par `userId`. */
  readonly avatarUrls = signal<Map<number, string>>(new Map());

  /**
   * Libellés des pays par id. Le endpoint de liste ne renvoie que `paysId` ; le
   * référentiel est petit, immuable et mémorisé pour la session par `AffaireService`,
   * donc une seule requête sert la liste entière, les deux vues et les changements de page.
   */
  private readonly paysList = signal<PaysRefDto[]>([]);
  /** id → nom du pays dans la langue de l'interface (recalculé au changement de langue). */
  readonly paysLabels = computed(() => {
    const lang = this.translate.currentLang();
    return new Map(this.paysList().map(p => [p.id, paysLabel(p, lang)]));
  });

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
  /** Statut de l'affaire (`statut`, filtre serveur) — '' = tous. */
  filterStatut = signal('');
  /** Pays / entité de l'affaire (`paysId`, filtre serveur) — null = tous. */
  filterPaysId = signal<number | null>(null);
  /** Manager de l'affaire (`responsableId`, filtre serveur) — null = tous. */
  filterResponsableId = signal<number | null>(null);
  /** Mode de facturation (`billingMode`, filtre serveur) — '' = tous. */
  filterBillingMode   = signal('');
  /** Période de début de l'affaire (`dateDebutFrom`/`dateDebutTo`, bornes incluses) — null = toutes. */
  filterDateDebut     = signal<Date[] | null>(null);
  viewMode     = signal<ViewMode>('grid');
  /**
   * Tri serveur choisi dans l'en-tête du tableau : `sort` tel qu'affiché (graine de la
   * flèche), `sortParam` tel qu'envoyé à l'API. Il porte sur la LISTE seulement — les
   * tuiles (`/summary`) ne dépendent pas de l'ordre. Conservé entre cartes et liste.
   */
  readonly sort      = signal<AffaireSort | null>(null);
  private readonly sortParam = signal<string | null>(null);

  /**
   * Restriction à un client (`clientId`, filtre serveur). Elle arrive soit par
   * `?clientId=` — « Voir les affaires » depuis une fiche client —, soit par le panneau
   * de filtres. Dans les deux cas le bandeau de contexte la rappelle, avec son bouton
   * pour revenir à la liste complète.
   */
  filterClientId = signal<number | null>(null);
  clientName     = signal<string | null>(null);

  /**
   * Clients actifs proposés dans le panneau (`GET /clients/dropdown`, déjà trié par nom
   * côté serveur). Vide si l'appel échoue — le filtre reste alors sans option.
   */
  private readonly clientOptions = signal<{ value: string; label: string }[]>([]);

  /** Utilisateurs proposés comme manager (`GET /ref/users`), triés par nom. Vide si l'appel échoue. */
  private readonly managerOptions = signal<{ value: string; label: string }[]>([]);

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
    !!this.searchText().trim() || !!this.filterStatut() || this.filterClientId() !== null
    || this.filterPaysId() !== null || this.filterResponsableId() !== null
    || !!this.filterBillingMode() || !!this.filterDateDebut()?.length);

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
      {
        name: 'client',
        label: t('AFFAIRES.LIST.TABLE.HEADERS.CLIENT'),
        type: 'select',
        placeholder: t('AFFAIRES.LIST.FILTER_ALL_CLIENTS'),
        searchable: true,
        options: this.clientOptions(),
      },
      {
        name: 'pays',
        label: t('AFFAIRES.LIST.TABLE.HEADERS.PAYS'),
        type: 'select',
        placeholder: t('AFFAIRES.LIST.FILTER_ALL_PAYS'),
        searchable: true,
        options: [...this.paysLabels()]
          .map(([id, label]) => ({ value: String(id), label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        name: 'manager',
        label: t('AFFAIRES.LIST.TABLE.HEADERS.MANAGER'),
        type: 'select',
        placeholder: t('AFFAIRES.LIST.FILTER_ALL_MANAGERS'),
        searchable: true,
        options: this.managerOptions(),
      },
      {
        name: 'billingMode',
        label: t('AFFAIRES.DETAIL.INFO.BILLING_MODE'),
        type: 'select',
        placeholder: t('AFFAIRES.LIST.FILTER_ALL'),
        options: BILLING_MODES.map(m => ({ value: m.code, label: enumLabel(this.translate, 'BILLING_MODE', m.code) })),
      },
      {
        name: 'dateDebut',
        label: t('AFFAIRES.LIST.FILTER_DATE_DEBUT'),
        type: 'daterange',
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
        client: this.filterClientId() !== null ? [String(this.filterClientId())] : [],
        pays:   this.filterPaysId()   !== null ? [String(this.filterPaysId())]   : [],
        manager:     this.filterResponsableId() !== null ? [String(this.filterResponsableId())] : [],
        billingMode: this.filterBillingMode() ? [this.filterBillingMode()] : [],
        dateDebut:   this.filterDateDebut(),
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
    this.svc.getPays().subscribe(list => this.paysList.set(list));
    // `pays=0` : tous les clients actifs, toutes entités confondues (comme l'assistant).
    this.clientSvc.getDropdown(0).subscribe(list =>
      this.clientOptions.set(list.map(c => ({ value: String(c.id), label: c.clientName }))));
    this.svc.getUsers().subscribe(list =>
      this.managerOptions.set(list
        .filter(u => !!u.fullName)
        .map(u => ({ value: String(u.id), label: u.fullName }))
        .sort((a, b) => a.label.localeCompare(b.label))));
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
    const range = this.filterDateDebut();
    return {
      search:   this.searchText().trim() || null,
      statut:   this.filterStatut()      || null,
      clientId: this.filterClientId(),
      paysId:   this.filterPaysId(),
      responsableId: this.filterResponsableId(),
      billingMode:   this.filterBillingMode() || null,
      // Un seul jour choisi = une période d'un jour.
      dateDebutFrom: range?.length ? toIsoDay(range[0]) : null,
      dateDebutTo:   range?.length ? toIsoDay(range[range.length - 1]) : null,
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
      sort: this.sortParam(),
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

    const pays = Number(result['pays']);
    this.filterPaysId.set(Number.isFinite(pays) && pays > 0 ? pays : null);

    const manager = Number(result['manager']);
    this.filterResponsableId.set(Number.isFinite(manager) && manager > 0 ? manager : null);

    this.filterBillingMode.set((result['billingMode'] as string | null) ?? '');

    const dateDebut = result['dateDebut'];
    this.filterDateDebut.set(Array.isArray(dateDebut) && dateDebut.length ? dateDebut as Date[] : null);

    const client = Number(result['client']);
    const clientId = Number.isFinite(client) && client > 0 ? client : null;
    if (clientId !== this.filterClientId()) {
      this.filterClientId.set(clientId);
      this.clientName.set(clientId === null ? null
        : this.clientOptions().find(o => o.value === String(clientId))?.label ?? null);
      // Le client choisi dans le panneau remplace celui du lien d'arrivée : on retire
      // `?clientId=` de l'URL, sinon un rechargement ramènerait l'ancien.
      this.router.navigate([], {
        relativeTo: this.activatedRoute,
        queryParams: { clientId: null, client: null },
        queryParamsHandling: 'merge',
      });
    }

    this.currentPage.set(0);
    this.load();
    this.loadSummary();
  }

  /** Un nouvel ordre est un nouveau jeu : retour à la première page (les tuiles ne bougent pas). */
  onSortChange(change: { sort: AffaireSort | null; param: string | null }): void {
    this.sort.set(change.sort);
    this.sortParam.set(change.param);
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

/** Jour local `yyyy-MM-dd` — jamais `toISOString()`, qui recule d'un jour à l'est d'UTC. */
function toIsoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
