import { Component, OnInit, TemplateRef, ViewChild, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  selectSelectedCountryId,
  ButtonComponent, FilterField, FilterResult, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, MetricDelta, ModalRef, ModalService, PageComponent, PageHeaderComponent,
  PaginationComponent, SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
  SectionCardComponent, PageHeaderBadge, BreadcrumbItem,
} from '@khalilrebhiitec/daf360';
import { InvoiceService } from '../invoice.service';
import { INVOICE_STATUT_CONFIG, InvoiceAffaireGroup, InvoiceFilter, InvoiceListItem, InvoiceListSummary } from '../invoice.model';
import { PENDING_STATUTS, formatDate, isOverdue } from '../invoice-display';
import { AffairePick, InvoicesByAffaireSectionComponent } from './invoices-by-affaire-section.component';
import { FinancePaths } from '../../../core/finance-paths';
import { InvoicesCardsSectionComponent } from './invoices-cards-section.component';
import { InvoicesTableSectionComponent } from './invoices-table-section.component';
import { PaymentModalComponent } from '../payment-modal.component';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableSort, sortParam } from '../../../shared/table-tools';
import { AffaireService } from '../../affaires/affaire.service';
import type { AffaireDetail, AffaireListItem, ClientDto } from '../../affaires/affaire.model';
import { STATUT_LABELS } from '../../affaires/affaire.model';
import { STATUT_BADGE_VARIANT as AFFAIRE_STATUT_BADGE } from '../../affaires/affaire-display';
import { NgTemplateOutlet } from '@angular/common';
import { InvoiceListStateService } from './invoice-list-state.service';
import { ExportService } from '../../../core/export.service';
import { PageGuideComponent } from '../../../shared/guide/page-guide.component';
import type { GuideStep } from '../../../shared/guide/page-guide.types';
import { HeaderPaysService } from '../../../core/header-pays.service';

/** Guide de la page — chaque `target` est un `data-guide` du gabarit. */
const GUIDE_STEPS: GuideStep[] = [
  { icon: 'receipt_long', titleKey: 'GUIDE.INVOICES.INTRO_TITLE',   textKey: 'GUIDE.INVOICES.INTRO_TEXT' },
  { icon: 'add',          titleKey: 'GUIDE.INVOICES.NEW_TITLE',     textKey: 'GUIDE.INVOICES.NEW_TEXT',     target: 'invoices-new' },
  { icon: 'monitoring',   titleKey: 'GUIDE.INVOICES.KPIS_TITLE',    textKey: 'GUIDE.INVOICES.KPIS_TEXT',    target: 'invoices-kpis' },
  { icon: 'search',       titleKey: 'GUIDE.INVOICES.TOOLBAR_TITLE', textKey: 'GUIDE.INVOICES.TOOLBAR_TEXT', target: 'invoices-toolbar' },
  { icon: 'grid_view',    titleKey: 'GUIDE.INVOICES.LIST_TITLE',    textKey: 'GUIDE.INVOICES.LIST_TEXT',    target: 'invoices-list' },
  { icon: 'bolt',         titleKey: 'GUIDE.INVOICES.QUICK_TITLE',   textKey: 'GUIDE.INVOICES.QUICK_TEXT',   target: 'invoices-list' },
  { icon: 'route',        titleKey: 'GUIDE.INVOICES.LIFECYCLE_TITLE', textKey: 'GUIDE.INVOICES.LIFECYCLE_TEXT' },
  { icon: 'help',         titleKey: 'GUIDE.INVOICES.END_TITLE',     textKey: 'GUIDE.INVOICES.END_TEXT' },
];

type ApprovalDecision = 'APPROVE' | 'RETURN' | 'REJECT';
/** `affaire` : les affaires, chacune dépliable sur ses factures (invoices-by-affaire-section). */
type ViewMode = 'grid' | 'list' | 'affaire';

@Component({
  selector: 'app-invoice-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, PaginationComponent, DisplayCurrencyPipe, FormFieldComponent,
    InvoicesCardsSectionComponent, InvoicesTableSectionComponent, InvoicesByAffaireSectionComponent, PaymentModalComponent,
    PageGuideComponent, SectionCardComponent, NgTemplateOutlet,
  ],
  host: { class: 'block' },
  templateUrl: './invoice-list.component.html',
})
export class InvoiceListComponent implements OnInit {
  /** Vue tableau uniquement (undefined en vue cartes) — son `daf-data-table` va au `[table]` de la toolbar. */
  readonly tableSection = viewChild(InvoicesTableSectionComponent);
  /**
   * Clé de la barre de recherche : l'incrémenter la recrée. Elle ne relit `initialValues`
   * que tant que l'utilisateur n'a pas filtré lui-même ; recréée, elle repart des filtres de
   * la page — c'est ainsi qu'un filtre posé par le code (carte d'affaire) s'y affiche.
   */
  readonly toolbarKey = signal(0);
  protected readonly paths = inject(FinancePaths);

  private readonly svc       = inject(InvoiceService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  /**
   * Route `invoicing/affaire/:affaireId` : la page d'UNE affaire (KPI + factures), ouverte
   * depuis sa carte. Le filtre Affaire y est figé, l'état de la liste principale n'est ni
   * relu ni écrasé, et la vue « Par affaire » n'est pas proposée.
   */
  readonly lockedAffaireId: number | null = Number(this.route.snapshot.paramMap.get('affaireId')) || null;
  /** En-tête de la page d'affaire. */
  readonly lockedAffaire = signal<AffaireDetail | null>(null);
  private readonly currencyPipe = new DisplayCurrencyPipe();
  private readonly modal     = inject(ModalService);

  readonly guideSteps = GUIDE_STEPS;
  private readonly translate = inject(TranslateService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly exportSvc  = inject(ExportService);
  /** Export Excel en cours — état de chargement du bouton. */
  readonly exporting = signal(false);

  @ViewChild('approvalTpl') approvalTpl!: TemplateRef<unknown>;
  @ViewChild('paymentModal', { static: true }) private paymentModal!: PaymentModalComponent;
  private approvalRef: ModalRef | null = null;

  invoices      = signal<InvoiceListItem[]>([]);
  error         = signal<string | null>(null);
  actionError   = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  /** Tri serveur choisi dans l'en-tête du tableau (clé de colonne), `null` = ordre par défaut. */
  readonly sort = signal<TableSort | null>(null);
  pageSize      = signal(20);

  /** `firstLoad` drives the whole-page skeleton, `loading` only the table (§5). */
  firstLoad = signal(true);
  loading   = signal(false);

  searchText      = signal('');
  filterStatut    = signal('');
  filterDateRange = signal<Date[] | null>(null);
  /** Client id as a string ('' = all) — sent server-side as `clientId`. */
  filterClient    = signal('');
  /** Affaire id as a string ('' = all) — sent server-side as `affaireId`. */
  filterAffaire   = signal('');
  /** Due-date range (1 or 2 days) — sent server-side as `dueFrom` / `dueTo`. */
  filterDueRange  = signal<Date[] | null>(null);
  /** Minimum TTC as typed ('' = no bound) — sent server-side as `minTtc`. */
  filterMinTtc    = signal('');
  /** Maximum TTC as typed ('' = no bound) — sent server-side as `maxTtc`. */
  filterMaxTtc    = signal('');
  /** Overdue only (open, non-credit-note, due before today) — sent as `overdueOnly`. */
  filterOverdue   = signal(false);
  viewMode       = signal<ViewMode>('grid');

  private readonly listState = inject(InvoiceListStateService);

  /**
   * Chaque changement de filtre, de tri, de page ou de vue est mémorisé, pour que le
   * retour depuis le détail (fil d'Ariane) retrouve la liste telle qu'on l'a quittée.
   * Le premier passage a lieu après `ngOnInit`, donc après la restauration : il réécrit
   * l'état restauré, sans l'écraser par des valeurs vides.
   */
  private readonly persistState = effect(() => {
    if (this.lockedAffaireId) return; // la page d'affaire ne touche pas à l'état de la liste
    this.listState.save({
      searchText: this.searchText(),
      statut:     this.filterStatut(),
      dateRange:  this.filterDateRange(),
      client:     this.filterClient(),
      affaire:    this.filterAffaire(),
      dueRange:   this.filterDueRange(),
      minTtc:     this.filterMinTtc(),
      maxTtc:     this.filterMaxTtc(),
      overdue:    this.filterOverdue(),
      sort:       this.sort(),
      page:       this.currentPage(),
      pageSize:   this.pageSize(),
      viewMode:   this.viewMode(),
    });
  });

  // ── Pays : les drapeaux de la barre (store partagé avec le shell) ──────────
  /**
   * Ids FINANCE de tous les drapeaux cochés (`178,63`) ; null = « Tous les pays » (le serveur
   * applique alors le périmètre du rôle). Envoyé à la liste, à l'export et aux options du
   * filtre « Affaire ».
   */
  readonly paysId = computed<string | null>(() => this.headerPaysList() ?? null);
  private readonly headerPaysList = inject(HeaderPaysService).paysList;
  /** Pays des données affichées — pour ne recharger que sur un VRAI changement de drapeau. */
  private loadedPaysId: string | null | undefined = undefined;

  /**
   * Changement de drapeau = nouveau jeu : page 0, liste rechargée, et la liste d'affaires
   * du filtre « Affaire » suit le pays (premier passage après `ngOnInit`). Un filtre Affaire
   * déjà choisi sur l'ancien pays est retiré : il viderait la liste sans raison visible.
   */
  private readonly followHeaderCountry = effect(() => {
    const paysId = this.paysId();
    untracked(() => {
      if (paysId === this.loadedPaysId) return;
      this.loadedPaysId = paysId;
      if (!this.lockedAffaireId) this.filterAffaire.set('');
      this.currentPage.set(0);
      this.load();
      this.loadAffaireOptions();
    });
  });

  /** Reference lists for the client / affaire selects — the page's own rows only cover
   *  the current page, which is too narrow for a server-side filter. */
  private readonly clients  = signal<ClientDto[]>([]);
  private readonly affaires = signal<AffaireListItem[]>([]);

  private readonly clientOptions = computed(() =>
    this.clients()
      .map(c => ({ value: String(c.id), label: c.clientName }))
      .sort((a, b) => a.label.localeCompare(b.label)));

  private readonly affaireOptions = computed(() =>
    this.affaires()
      .map(a => ({ value: String(a.id), label: a.intitule ? `${a.reference} — ${a.intitule}` : a.reference }))
      .sort((a, b) => a.label.localeCompare(b.label)));

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    // Page d'affaire : tableau uniquement, pas de sélecteur de vue.
    if (this.lockedAffaireId) return [];
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('INVOICING.LIST.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('INVOICING.LIST.VIEW_LIST') },
      ...(this.lockedAffaireId ? [] : [
        { id: 'affaire', icon: 'folder_open', tooltip: this.translate.instant('INVOICING.LIST.VIEW_AFFAIRE') },
      ]),
    ];
  });

  approvalTarget   = signal<InvoiceListItem | null>(null);
  approvalDecision = signal<ApprovalDecision>('APPROVE');
  approvalCommentSig = signal('');

  // ── KPI — sur TOUTES les factures filtrées (GET /invoices/summary), pas la seule page ──
  // Total = TTC (volume facturé) ; en attente / en retard / en litige = net à payer (argent
  // encore à recouvrer). Mêmes règles qu'avant, calculées par le serveur.
  readonly summary = signal<InvoiceListSummary | null>(null);
  readonly statsTotal     = computed(() => this.summary()?.count ?? 0);
  readonly statsEnAttente = computed(() => this.summary()?.pendingCount ?? 0);
  readonly statsEnRetard  = computed(() => this.summary()?.overdueCount ?? 0);
  readonly statsEnLitige  = computed(() => this.summary()?.disputedCount ?? 0);
  readonly amountTotal     = computed(() => this.summary()?.totalTtcEur ?? 0);
  readonly amountEnAttente = computed(() => this.summary()?.pendingEur ?? 0);
  readonly amountEnRetard  = computed(() => this.summary()?.overdueEur ?? 0);
  readonly amountEnLitige  = computed(() => this.summary()?.disputedEur ?? 0);

  /** Vue « Par affaire » : une entrée par affaire, calculée par le serveur. */
  readonly affaireGroups = signal<InvoiceAffaireGroup[]>([]);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiTotal    : MetricCardOptions = { icon: 'receipt_long', iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiPending  : MetricCardOptions = { icon: 'schedule',     iconColor: 'text-teal',    iconBg: 'bg-teal/10'    };
  readonly kpiOverdue  : MetricCardOptions = {
    icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10',
    valueColor: 'text-danger', deltaColor: 'text-danger',
  };
  readonly kpiDisputed : MetricCardOptions = { icon: 'gavel', iconColor: 'text-warning', iconBg: 'bg-warning/10' };

  /** Chaque tuile porte son nombre de factures — sur tout le jeu filtré, comme son montant. */
  readonly deltaCurrentPage = computed<MetricDelta>(() => this.countDelta(this.statsTotal(), 'INVOICING.LIST.KPI.INVOICES_SUFFIX'));
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
  readonly filterFields = computed<FilterField[]>(() =>
    this.allFilterFields().filter(f => !this.lockedAffaireId || f.name !== 'affaire'));

  private readonly allFilterFields = computed<FilterField[]>(() => {
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
      {
        name: 'client',
        label: t('INVOICING.LIST.TABLE.CLIENT'),
        type: 'select',
        searchable: true,
        placeholder: t('INVOICING.LIST.FILTER.ALL'),
        options: this.clientOptions(),
      },
      {
        name: 'affaire',
        label: t('INVOICING.DETAIL.INFO.AFFAIRE'),
        type: 'select',
        searchable: true,
        placeholder: t('INVOICING.LIST.FILTER.ALL'),
        options: this.affaireOptions(),
      },
      {
        name: 'overdue',
        label: t('INVOICING.LIST.FILTER.OVERDUE_ONLY'),
        type: 'checkbox',
      },
      {
        name: 'dueDates',
        label: t('INVOICING.LIST.FILTER.DUE_PERIOD'),
        type: 'daterange',
        placeholder: t('INVOICING.LIST.FILTER.PERIOD_PLACEHOLDER'),
      },
      {
        name: 'minTtc',
        label: t('INVOICING.LIST.FILTER.AMOUNT_MIN'),
        type: 'text',
        placeholder: t('INVOICING.LIST.FILTER.AMOUNT_PH'),
      },
      {
        name: 'maxTtc',
        label: t('INVOICING.LIST.FILTER.AMOUNT_MAX'),
        type: 'text',
        placeholder: t('INVOICING.LIST.FILTER.AMOUNT_PH'),
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
        statut:  this.filterStatut()  ? [this.filterStatut()]  : [],
        dates:   this.filterDateRange(),
        client:  this.filterClient()  ? [this.filterClient()]  : [],
        affaire: this.filterAffaire() ? [this.filterAffaire()] : [],
        overdue:  this.filterOverdue(),
        dueDates: this.filterDueRange(),
        minTtc:   this.filterMinTtc(),
        maxTtc:   this.filterMaxTtc(),
      },
    };
  });

  ngOnInit(): void {
    if (this.lockedAffaireId) {
      this.filterAffaire.set(String(this.lockedAffaireId));
      // Page d'affaire : vue tableau par défaut (la grille reste au choix).
      this.viewMode.set('list');
      this.affaireSvc.getAffaire(this.lockedAffaireId).subscribe({
        next:  a => this.lockedAffaire.set(a),
        error: () => this.lockedAffaire.set(null),
      });
    } else {
      this.restoreState();
    }
    this.loadedPaysId = this.paysId();
    this.load();
    this.affaireSvc.getClients().subscribe(list => this.clients.set(list));
    this.loadAffaireOptions();
  }

  /** Options du filtre « Affaire » : les affaires du pays du drapeau (toutes sur « Tous »). */
  private loadAffaireOptions(): void {
    const paysId = this.paysId();
    this.affaireSvc.getAffaires({ size: 200, paysId }).subscribe({
      next:  page => { if (paysId === this.paysId()) this.affaires.set(page.content); },
      error: () => this.affaires.set([]),
    });
  }

  /**
   * Avant le premier rendu : `daf-filter` ne lit `initialValues` qu'une fois, le panneau
   * doit donc naître avec les valeurs restaurées.
   */
  private restoreState(): void {
    const s = this.listState.restore();
    if (!s) return;
    this.searchText.set(s.searchText);
    this.filterStatut.set(s.statut);
    this.filterDateRange.set(s.dateRange);
    this.filterClient.set(s.client);
    this.filterAffaire.set(s.affaire);
    this.filterDueRange.set(s.dueRange);
    this.filterMinTtc.set(s.minTtc);
    this.filterMaxTtc.set(s.maxTtc);
    this.filterOverdue.set(s.overdue);
    this.sort.set(s.sort);
    this.currentPage.set(s.page);
    this.pageSize.set(s.pageSize);
    this.viewMode.set(s.viewMode);
  }

/** Libellé de l'affaire filtrée, pour le bandeau (options du filtre, sinon la carte cliquée). */
  private readonly pickedLabel = signal<string | null>(null);
  readonly filteredAffaireLabel = computed(() => {
    const id = this.filterAffaire();
    if (!id) return null;
    return this.affaireOptions().find(o => o.value === id)?.label ?? this.pickedLabel() ?? `#${id}`;
  });

  /** Clic sur une carte d'affaire : la page de l'affaire (ses KPI et ses factures). */
  onAffairePick(pick: AffairePick): void {
    this.pickedLabel.set(pick.label);
    this.router.navigate([...this.paths.invoices(), 'affaire', pick.id]);
  }

  /** Bandeau « ✕ » (filtre Affaire posé depuis le panneau) : retour à toutes les factures. */
  clearAffaireFilter(): void {
    this.setAffaireFilter(null);
  }

  // ── Page d'affaire : en-tête, carte d'identité, indicateurs ──────────────────
  readonly affaireBadges = computed<PageHeaderBadge[]>(() => {
    const a = this.lockedAffaire();
    if (!a) return [];
    this.translate.currentLang();
    return [{ label: this.translate.instant(STATUT_LABELS[a.statut] ?? a.statut),
              variant: AFFAIRE_STATUT_BADGE[a.statut] ?? 'neutral', dot: true }];
  });

  readonly affaireBreadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('FACTURATION.layout.NAV.INVOICING_LIST'), link: this.paths.invoices() as string[] },
      { label: this.lockedAffaire()?.reference ?? '…' },
    ];
  });

  readonly affaireLeadFields = computed<{ label: string; value: string }[]>(() => {
    const a = this.lockedAffaire();
    if (!a) return [];
    return [
      { label: 'INVOICING.DETAIL.INFO.CLIENT',  value: a.clientName ?? '—' },
      { label: 'INVOICING.DETAIL.INFO.AFFAIRE', value: [a.reference, a.intitule].filter(Boolean).join(' — ') },
    ];
  });

  readonly affaireGridFields = computed<{ label: string; value: string }[]>(() => {
    const a = this.lockedAffaire();
    if (!a) return [];
    const date = (d: string | null) => d ? formatDate(d) : '—';
    return [
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_RESPONSABLE', value: a.responsableFullName ?? '—' },
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_MODE',        value: a.billingMode ?? '—' },
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_BUDGET',      value: this.currencyPipe.transform(a.budgetPrevisionnel, a.devise) },
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_CURRENCY',    value: a.devise ?? '—' },
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_START',       value: date(a.dateDebut) },
      { label: 'INVOICING.LIST.BY_AFFAIRE.F_END',         value: date(a.dateFin) },
    ];
  });

  /** Les 4 indicateurs de la liste, en tuiles (page d'affaire). */
  readonly affaireKpiTiles = computed(() => [
    { label: 'INVOICING.LIST.KPI.TOTAL',    value: this.amountTotal(),     delta: this.deltaCurrentPage(), options: this.kpiTotal },
    { label: 'INVOICING.LIST.KPI.PENDING',  value: this.amountEnAttente(), delta: this.deltaPending(),     options: this.kpiPending },
    { label: 'INVOICING.LIST.KPI.OVERDUE',  value: this.amountEnRetard(),  delta: this.deltaOverdue(),     options: this.kpiOverdue },
    { label: 'INVOICING.LIST.KPI.DISPUTED', value: this.amountEnLitige(),  delta: this.deltaDisputed(),    options: this.kpiDisputed },
  ]);

  /** Sous-titre de la page d'affaire : référence · client (le titre est l'intitulé). */
  readonly lockedSubtitle = computed(() => {
    const a = this.lockedAffaire();
    return a ? [a.reference, a.clientName].filter(Boolean).join(' · ') : '';
  });

  private setAffaireFilter(affaire: string | null): void {
    this.filterAffaire.set(affaire ?? '');
    this.currentPage.set(0);
    this.toolbarKey.update(k => k + 1);
    this.load();
  }

  openAffaire(): void {
    if (this.filterAffaire()) this.router.navigate(this.paths.affaire(this.filterAffaire()));
  }

  /** Entrée ou sortie de la vue « Par affaire » : la source des données change, on recharge. */
  onViewChange(view: string): void {
    const wasByAffaire = this.viewMode() === 'affaire';
    this.viewMode.set(view as ViewMode);
    if (wasByAffaire !== (view === 'affaire')) this.load();
  }

  /** Bumped à chaque chargement : une réponse lente d'un ancien filtre est ignorée. */
  private loadSeq = 0;

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const seq = ++this.loadSeq;
    const filter = this.currentFilter();
    // Tuiles KPI : toujours sur tout le jeu filtré, quelle que soit la vue.
    this.svc.getInvoiceSummary(filter).subscribe({
      next:  s => { if (seq === this.loadSeq) this.summary.set(s); },
      error: () => { if (seq === this.loadSeq) this.summary.set(null); },
    });
    // Vue « Par affaire » : les affaires, agrégées par le serveur — pas de liste de factures.
    if (this.viewMode() === 'affaire') {
      this.svc.getInvoicesByAffaire(filter).subscribe({
        next: groups => {
          if (seq !== this.loadSeq) return;
          this.affaireGroups.set(groups);
          this.loading.set(false);
          this.firstLoad.set(false);
        },
        error: () => {
          if (seq !== this.loadSeq) return;
          this.error.set(this.translate.instant('INVOICING.LIST.LOAD_ERROR'));
          this.loading.set(false);
          this.firstLoad.set(false);
        },
      });
      return;
    }
    const pageFilter: InvoiceFilter = { page: this.currentPage(), size: this.pageSize(), ...filter };
    this.svc.getInvoices(pageFilter).subscribe({
      next: res => {
        if (seq !== this.loadSeq) return;
        // Page restaurée devenue hors limites (factures supprimées entre-temps) :
        // on retombe sur la première plutôt que d'afficher une liste vide.
        if (res.content.length === 0 && this.currentPage() > 0) {
          this.currentPage.set(0);
          this.load();
          return;
        }
        this.invoices.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.error.set(this.translate.instant('INVOICING.LIST.LOAD_ERROR'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  /** Filtres + tri de l'écran (sans pagination) — partagés par la liste et l'export Excel. */
  private currentFilter() {
    const range = this.filterDateRange() ?? [];
    const dueRange = this.filterDueRange() ?? [];
    return {
      paysId:    this.paysId(),
      statut:    this.filterStatut() || null,
      clientId:  this.filterClient()  ? +this.filterClient()  : null,
      affaireId: this.filterAffaire() ? +this.filterAffaire() : null,
      // A single picked day is a one-day range.
      from:      toIsoDate(range[0]),
      to:        toIsoDate(range[1] ?? range[0]),
      dueFrom:   toIsoDate(dueRange[0]),
      dueTo:     toIsoDate(dueRange[1] ?? dueRange[0]),
      minTtc:    parseAmount(this.filterMinTtc()),
      maxTtc:    parseAmount(this.filterMaxTtc()),
      overdueOnly: this.filterOverdue(),
      search:    this.searchText().trim() || null,
      sort:      sortParam(this.sort()),
    };
  }

  /** Export généré par le backend (InvoiceExportController) : toutes les factures qui
   * répondent à la recherche, aux filtres et au tri de l'écran — pagination ignorée, un
   * export est un extrait complet. Deux feuilles : factures et lignes de facturation. */
  exportExcel(): void {
    if (!this.totalElements()) return;
    this.exportSvc.download(
      this.exportSvc.invoices(this.currentFilter()),
      `Factures_${toIsoDay(new Date())}.xlsx`, this.exporting);
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
    this.filterStatut.set((result['statut'] as string | null) ?? '');
    const dates = result['dates'];
    this.filterDateRange.set(Array.isArray(dates) && dates.length ? (dates as Date[]) : null);
    this.filterClient.set((result['client'] as string | null) ?? '');
    this.filterAffaire.set(this.lockedAffaireId
      ? String(this.lockedAffaireId)
      : ((result['affaire'] as string | null) ?? ''));
    this.filterOverdue.set(result['overdue'] === true);
    const dueDates = result['dueDates'];
    this.filterDueRange.set(Array.isArray(dueDates) && dueDates.length ? (dueDates as Date[]) : null);
    this.filterMinTtc.set(((result['minTtc'] as string | null) ?? '').trim());
    this.filterMaxTtc.set(((result['maxTtc'] as string | null) ?? '').trim());
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

  // Chemins absolus : la page d'affaire (`invoicing/affaire/:id`) partage ce composant.
  navigateToDetail(id: number): void { this.router.navigate(this.paths.invoice(id)); }
  navigateToNew():        void { this.router.navigate([...this.paths.invoices(), 'new']); }

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

  openPaymentModal(item: InvoiceListItem): void { this.paymentModal.open(item, () => this.load()); }

  openApprovalModal(item: InvoiceListItem): void {
    this.approvalTarget.set(item);
    this.approvalDecision.set('APPROVE');
    this.approvalCommentSig.set('');
    this.approvalRef = this.modal.open({
      title: this.translate.instant('INVOICING.LIST.APPROVAL.TITLE'),
      body:  this.approvalTpl,
      size:  'md',
      closeOnBackdrop: false,
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
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
  return d instanceof Date ? toIsoDay(d) : null;
}

/** Typed amount → number (accepts spaces and a decimal comma); blank or invalid → no bound. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Local calendar day as `YYYY-MM-DD` — never toISOString(), which shifts to UTC. */
function toIsoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
