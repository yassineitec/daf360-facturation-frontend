import { Component, OnInit, TemplateRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AvatarGroupComponent, BarChartComponent, ButtonComponent, ButtonOptions, DataTableComponent,
  MetricCardComponent,
  DrawerComponent, FormFieldComponent, FormFieldOptions, GaugeComponent, ModalService,
  PageComponent, PageHeaderComponent, ProgressBarComponent, ProgressBarOptions,
  RadioGroupComponent, SearchToolbarComponent, SectionCardComponent, StatusBadgeComponent,
  TabsComponent,
} from '@khalilrebhiitec/daf360';
import type {
  AvatarData, BadgeCell, BarChartBar, BarChartOptions, BreadcrumbItem, DrawerConfig,
  MetricCardOptions, MetricDelta,
  FilterField, FilterResult, GaugeOptions, PageHeaderBadge, RadioOption,
  SearchToolbarFilterConfig, TabItem, TableAction, TableColumn, TableConfig, TableRow,
  ToolbarAction,
} from '@khalilrebhiitec/daf360';
import { AffaireService } from './affaire.service';
import { AffaireWizardService } from './affaire-wizard.service';
import {
  AffaireDetail, RafDetailsDto, AffaireKpisDto, TsDto,
  AffaireInvoiceItem, AffairePaymentItem,
  STATUT_TRANSITIONS, STATUT_LABELS, TYPE_LABELS, TS_STATUT_CONFIG,
} from './affaire.model';
import { UserStore } from '../../core/user.store';
import { PermissionDirective } from '../../shared/permission.directive';
import { TsFormComponent } from './ts/ts-form.component';
import { AfaireBillingTabComponent } from './billing/affaire-billing-tab.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { STATUT_BADGE_VARIANT } from './affaire-display';
import { EmployeeAvatar, EmployeeAvatarService } from '../../core/employee-avatar.service';

/** A read-only label/value pair. `label` is always a translation key. */
interface DetailField { label: string; value: string; }

/** One `daf-metric-card` of the right column's KPI row. `label` is a translation key. */
interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

interface RowDetail {
  titleKey: string;
  ref:      string;
  fields:   DetailField[];
  /** Optional footer button — hands the row over to its own module. */
  openAction?: { labelKey: string; run: () => void };
}

interface ActivityRow {
  id:       string;
  icon:     string;
  titleKey: string;
  params:   Record<string, string>;
  sub:      string;
  ts:       number;
}


const MONTH_LABELS = ['JAN', 'FÉV', 'MAR', 'AVR', 'MAI', 'JUN', 'JUL', 'AOÛ', 'SEP', 'OCT', 'NOV', 'DÉC'];

/** Statuts de facture qui ne génèrent plus d'échéance à suivre. */
const SETTLED_INVOICE_STATUTS = new Set(['PAID', 'CANCELLED', 'CREDIT_NOTED']);

/** Statuts où la facture accepte encore une modification (cf. son propre écran). */
const EDITABLE_INVOICE_STATUTS = new Set(['DRAFT', 'RETURNED']);

const PRIORITY_BADGE: Record<string, 'danger' | 'warning' | 'neutral'> = {
  high: 'danger', medium: 'warning', standard: 'neutral',
};

@Component({
  selector: 'app-affaire-detail',
  imports: [
    TranslatePipe, DisplayCurrencyPipe, DecimalPipe, PermissionDirective,
    PageComponent, PageHeaderComponent, SectionCardComponent, TabsComponent, ButtonComponent,
    ProgressBarComponent, StatusBadgeComponent, SearchToolbarComponent, DataTableComponent, MetricCardComponent,
    DrawerComponent, RadioGroupComponent, FormFieldComponent,
    GaugeComponent, BarChartComponent, AvatarGroupComponent,
    TsFormComponent, AfaireBillingTabComponent,
  ],
  // Injected to format amounts inside computeds (table rows, CSV, bar labels), so it
  // has to be provided — the pipe is only ambient in a template.
  providers: [DisplayCurrencyPipe],
  templateUrl: './affaire-detail.component.html',
})
export class AffaireDetailComponent implements OnInit {
  // Bound from route param via withComponentInputBinding()
  id = input<string>();

  private readonly svc       = inject(AffaireService);
  private readonly wizardSvc = inject(AffaireWizardService);
  private readonly store     = inject(UserStore);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly modals    = inject(ModalService);
  private readonly avatarSvc = inject(EmployeeAvatarService);

  private readonly rowDetailTpl   = viewChild.required<TemplateRef<unknown>>('rowDetailTpl');
  private readonly statutTpl      = viewChild.required<TemplateRef<unknown>>('statutTpl');
  private readonly tsValidationTpl = viewChild.required<TemplateRef<unknown>>('tsValidationTpl');

  affaire  = signal<AffaireDetail | null>(null);
  raf      = signal<RafDetailsDto | null>(null);
  kpis     = signal<AffaireKpisDto | null>(null);
  tsList   = signal<TsDto[]>([]);
  invoices = signal<AffaireInvoiceItem[]>([]);
  payments = signal<AffairePaymentItem[]>([]);
  /** Photos RH de l'équipe, par user id. Vide = initiales, ce qui est un état normal. */
  avatars  = signal<Map<number, EmployeeAvatar>>(new Map());

  /** Whole-page skeleton on the very first load only (§5) — a re-fetch keeps the page. */
  firstLoad   = signal(true);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);
  /** Error surfaced *inside* an open modal, where the page banner isn't visible. */
  modalError  = signal<string | null>(null);

  activeTab          = signal<string>('overview');
  activityDrawerOpen = signal(false);
  budgetLoading      = signal(false);
  showTsForm         = signal(false);

  // Statut modal
  targetStatut = signal('');
  motif        = signal('');

  // TS validation modal
  private tsValidationTarget = signal<{ ts: TsDto; step: 'technique' | 'commerciale' } | null>(null);
  tsNotes = signal('');

  // Row detail modal
  private modalRowState = signal<RowDetail | null>(null);
  readonly modalRow = this.modalRowState.asReadonly();

  // Filtres de tableaux
  tsSearch      = signal('');
  tsStatut      = signal('');
  invoiceSearch = signal('');
  invoiceStatut = signal('');
  paymentSearch = signal('');
  paymentMethod = signal('');

  get numId(): number { return Number(this.id()); }

  // ═══ En-tête ══════════════════════════════════════════════════════════════

  readonly affaireDevise = computed(() => this.affaire()?.devise || 'TND');

  readonly typeLabel = computed(() => {
    const a = this.affaire();
    return a ? (TYPE_LABELS[a.typeAffaire] ?? a.typeAffaire) : '';
  });

  readonly headerSubtitle = computed(() => {
    const a = this.affaire();
    if (!a) return '';
    return [a.reference, a.clientName].filter(Boolean).join(' · ');
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    this.translate.currentLang();

    const badges: PageHeaderBadge[] = [{
      label:   this.translate.instant(STATUT_LABELS[a.statut] ?? a.statut),
      variant: STATUT_BADGE_VARIANT[a.statut] ?? 'neutral',
      dot:     true,
    }];

    const health = this.healthState();
    badges.push({ label: this.translate.instant(health.labelKey), variant: health.variant });

    if (!a.budgetValide) {
      badges.push({
        label:   this.translate.instant('AFFAIRES.DETAIL.BUDGET_NOT_VALIDATED'),
        variant: 'warning',
      });
    }

    // Pas de pastille d'alerte RAF ici : depuis la 4.18.0 le rappel est porté par
    // `DrawerConfig.signal`, donc par l'onglet qui ouvre le panneau où vit l'alerte.
    // Le doubler sur le titre ferait deux marqueurs pour une seule condition.
    return badges;
  });

  /**
   * Le fil « Affaires » est un vrai lien, et rien n'écoute `(breadcrumbNavigate)`.
   *
   * C'est ce qui clochait : la lib rend un `<a routerLink>` **et** émet
   * `breadcrumbNavigate` au clic. Avec les deux branchés, le lien allait bien sur la
   * liste puis le handler renavigait — et il pointait `['../..']`, soit `/finance`. La
   * seconde navigation gagnait, donc le fil ramenait à l'accueil du module.
   *
   * `['..']` relatif plutôt que `/finance/affaires` absolu : la route de détail est
   * `affaires/:id`, donc `..` EST la liste, et ça reste juste quand l'app est servie
   * seule sur son port (les routes sont alors à la racine, pas sous `/finance`) —
   * c'est aussi la convention du reste de la page (`['../../invoicing']`, etc.).
   * Le dernier fil n'est jamais un lien côté lib, il n'y a rien à traiter pour lui.
   */
  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('AFFAIRES.DETAIL.BACK_TO_LIST'), link: ['..'] },
      { label: this.affaire()?.reference ?? '' },
    ];
  });

  // `fullWidth` sur les trois : ils vivent dans une grille 2 colonnes en pied de la carte
  // d'informations, c'est donc la cellule qui doit décider de la largeur, pas le libellé.
  readonly editButtonOptions = computed<ButtonOptions>(() => ({
    variant:   'secondary',
    size:      'sm',
    fullWidth: true,
    iconStart: 'edit_note',
    // Libellé court : c'est une des trois actions qui doivent tenir sur la ligne de titre.
    label: this.translate.instant(this.affaire()?.statut === 'DRAFT'
      ? 'AFFAIRES.DETAIL.SIDEBAR.COMPLETE_DRAFT_BTN'
      : 'AFFAIRES.DETAIL.ACTIONS.EDIT'),
  }));

  // Boutons de la carte d'identité : `size: 'sm'`, ils vivent dans une colonne de 30 %.
  readonly statusButtonOptions = computed<ButtonOptions>(() => ({
    variant:   'secondary',
    size:      'sm',
    fullWidth: true,
    iconStart: 'swap_horiz',
    label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.STATUS'),
    disabled:  this.availableTransitions().length === 0,
  }));

  readonly validateBudgetOptions = computed<ButtonOptions>(() => ({
    variant:   'primary',
    size:      'sm',
    fullWidth: true,
    iconStart: 'verified',
    label:     this.translate.instant('AFFAIRES.DETAIL.ACTIONS.VALIDATE_BUDGET'),
    loading:   this.budgetLoading(),
  }));

  // ═══ Colonne identité ═════════════════════════════════════════════════════

  /** Bloc pleine largeur en tête de carte : client, manager, période. */
  readonly identityLeadFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    return [
      { label: 'AFFAIRES.DETAIL.INFO.CLIENT',  value: a.clientName ?? '—' },
      { label: 'AFFAIRES.DETAIL.INFO.MANAGER', value: a.responsableFullName ?? '—' },
      { label: 'AFFAIRES.DETAIL.INFO.PERIOD',  value: `${this.formatDate(a.dateDebut)} — ${this.formatDate(a.dateFin)}` },
    ];
  });

  /** Grille 2 colonnes sous le bloc principal — comme la maquette. */
  readonly identityGridFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.INFO.CURRENCY',     value: this.affaireDevise() },
      { label: 'AFFAIRES.DETAIL.INFO.BILLING_MODE', value: a.billingMode ?? '—' },
      { label: 'AFFAIRES.DETAIL.INFO.ENGAGEMENT',   value: this.typeLabel() },
      {
        label: 'AFFAIRES.DETAIL.INFO.BUDGET_VALIDATED',
        value: this.translate.instant(a.budgetValide
          ? 'AFFAIRES.DETAIL.INFO.YES' : 'AFFAIRES.DETAIL.INFO.NO'),
      },
    ];
    if (a.doc360Ref)    fields.push({ label: 'AFFAIRES.DETAIL.INFO.DOC360',  value: a.doc360Ref });
    if (a.erpReference) fields.push({ label: 'AFFAIRES.DETAIL.INFO.ERP_REF', value: a.erpReference });
    return fields;
  });

  /**
   * Les 4 indicateurs financiers du haut de la colonne droite, sur `daf-metric-card`.
   *
   * Toutes les classes de couleur sont des **littéraux complets** (§3) : assemblées à
   * l'exécution elles ne survivraient pas au scan Tailwind de l'app consommatrice.
   *
   * La part du RAF passe par `delta` — `daf-metric-card` n'a pas de slot pastille, et
   * `delta` est exactement ça : une valeur secondaire à côté du chiffre. `direction:
   * 'neutral'` parce que c'est une part, pas une variation.
   */
  readonly kpiTiles = computed<KpiTile[]>(() => {
    const k = this.kpis();
    return [
      {
        label: 'AFFAIRES.DETAIL.KPI.CA',
        value: this.money(k?.ca),
        delta: null,
        options: { icon: 'account_balance_wallet', iconColor: 'text-primary', iconBg: 'bg-primary/10' },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.RAF',
        value: this.money(this.raf()?.rafDisponible),
        delta: this.budgetTotal() > 0
          ? { value: `${Math.round(this.rafAvailablePct())}%`, direction: 'neutral' }
          : null,
        options: { icon: 'request_quote', iconColor: 'text-teal', iconBg: 'bg-teal/10',
                   valueColor: 'text-primary' },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.MARGIN',
        value: this.formatPct(k?.margeBrutePct ?? null),
        delta: null,
        options: { icon: 'trending_up', iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
                   valueColor: 'text-secondary' },
      },
      {
        label: 'AFFAIRES.DETAIL.KPI.WIP',
        value: this.money(k?.wip),
        delta: null,
        options: { icon: 'pending_actions', iconColor: 'text-warning', iconBg: 'bg-warning/10' },
      },
    ];
  });

  readonly traceFields = computed<DetailField[]>(() => {
    const a = this.affaire();
    if (!a) return [];
    const fields: DetailField[] = [
      { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(a.createdAt) },
    ];
    if (a.updatedAt) {
      fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.LAST_MODIFIED', value: this.formatDate(a.updatedAt) });
    }
    fields.push({ label: 'AFFAIRES.DETAIL.SIDEBAR.RAF_THRESHOLD', value: `${a.rafAlerteSeuilPct}%` });
    return fields;
  });

  /**
   * Les personnes rattachées à l'affaire. Le backend d'affaires n'expose aujourd'hui que
   * le responsable ; la carte est déjà une liste pour que d'autres membres s'y ajoutent
   * sans retoucher le template — il suffira d'allonger `teamUserIds()`.
   */
  /**
   * `AvatarData` directement : `daf-avatar` dérive les initiales (`deriveInitials`, la même
   * fonction que la cellule avatar de `daf-data-table`, donc une personne s'affiche pareil
   * dans un tableau et sur une carte) et retombe dessus tout seul si l'image échoue — ce
   * qui arrive souvent, `photo_url` étant renseigné sur des profils dont le fichier manque
   * du stockage. C'est ce qui a remplacé le handler `onAvatarError` local.
   */
  readonly team = computed<AvatarData[]>(() => {
    const a = this.affaire();
    if (!a?.responsableFullName) return [];
    const avatar = a.responsableUserId ? this.avatars().get(a.responsableUserId) : undefined;
    return [{
      name:      a.responsableFullName,
      avatarUrl: this.avatarSvc.photoUrl(avatar),
      subtitle:  this.translate.instant('AFFAIRES.DETAIL.INFO.MANAGER'),
    }];
  });

  /** Les user ids dont on veut la photo. Une seule liste à allonger le jour où l'affaire portera une vraie équipe. */
  private teamUserIds(a: AffaireDetail): number[] {
    return a.responsableUserId ? [a.responsableUserId] : [];
  }

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════════════
  // D'où viennent les chiffres de la page
  //
  // Deux endpoints seulement alimentent tous les indicateurs, et AUCUN pourcentage
  // n'est calculé côté serveur — ils sont tous dérivés ici, ce qui est la raison
  // d'être de ce bloc.
  //
  //   GET /affaires/{id}/raf   → RafDetailsDto  : budgetPrevisionnel, totalFacturesEmises,
  //                                              montantTsIntegres, rafDisponible
  //   GET /affaires/{id}/kpis  → AffaireKpisDto : ca, wip, margeBrutePct
  //
  //   budgetTotal        = raf.budgetPrevisionnel, sinon affaire.budgetPrevisionnel
  //                        (le RAF arrive après l'affaire : sans ce repli les tuiles
  //                        affichent 0 % pendant un instant au chargement)
  //   billingPct         = totalFacturesEmises / budgetTotal × 100   « facturé »
  //   consumedAmount     = budgetTotal − rafDisponible               « consommé »
  //   consumptionPct     = consumedAmount / budgetTotal × 100
  //   tsIntegratedPct    = montantTsIntegres / budgetTotal × 100
  //   rafAvailablePct    = rafDisponible / budgetTotal × 100         (pastille RAF)
  //   healthState        = seuils sur consumptionPct, comparés au **seuil propre à
  //                        l'affaire** (rafAlerteSeuilPct) : < seuil = Optimale,
  //                        ≥ seuil = Vigilance, ≥ 100 % = Critique
  //   rafAlertActive     = consumptionPct ≥ rafAlerteSeuilPct (même règle, pour l'encart)
  //
  //   L'anneau « Santé du projet » affiche billingPct, coloré par healthState.
  //   Facturé et consommé sont deux choses différentes : un TS intégré augmente le
  //   consommé sans rien facturer, d'où deux indicateurs distincts et non un seul.
  //
  //   CA encaissé, WIP et Marge brute sont pris **tels quels** dans les KPIs du
  //   backend, la page ne les recalcule pas. À savoir sur ces trois-là :
  //     · ca   = SUM(payments.amount_local) des factures de l'affaire (encaissé réel) ;
  //     · wip  = 0 EN DUR côté serveur, la tuile affichera donc toujours 0 ;
  //     · margeBrutePct = (ca − sous-traitance) / ca × 100, donc un % du CA et non du
  //       budget, nul dès que ca vaut 0 ; les coûts internes sont un placeholder à 0
  //       (pas de timesheet), la marge est donc surévaluée tant qu'ils manquent.
  //
  //   Graphique mensuel : les 12 valeurs sont la somme des `montantTtc` des factures
  //   dont `dateEmission` tombe dans le mois, pour l'année affichée (celle de la
  //   dernière facture émise). L'objectif = budgetTotal / durée de l'affaire en mois
  //   (bornée à [1, 60]) — c'est une répartition linéaire, pas un objectif saisi.
  // ═══════════════════════════════════════════════════════════════════════════

  readonly budgetTotal = computed(() =>
    this.raf()?.budgetPrevisionnel ?? this.affaire()?.budgetPrevisionnel ?? 0);

  readonly billingPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.totalFacturesEmises ?? 0) / b) * 100 : 0;
  });

  readonly consumedAmount = computed(() => {
    const r = this.raf();
    return r ? this.budgetTotal() - r.rafDisponible : 0;
  });

  readonly consumptionPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? (this.consumedAmount() / b) * 100 : 0;
  });

  readonly tsIntegratedPct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.montantTsIntegres ?? 0) / b) * 100 : 0;
  });

  readonly rafAvailablePct = computed(() => {
    const b = this.budgetTotal();
    return b > 0 ? ((this.raf()?.rafDisponible ?? 0) / b) * 100 : 0;
  });

  readonly rafAlertActive = computed(() => {
    const a = this.affaire();
    return !!a && this.budgetTotal() > 0 && this.consumptionPct() >= a.rafAlerteSeuilPct;
  });

  /** Santé de l'affaire, dérivée du seuil d'alerte RAF paramétré sur l'affaire. */
  readonly healthState = computed<{ variant: 'success' | 'warning' | 'danger' | 'neutral'; labelKey: string }>(() => {
    const a = this.affaire();
    if (!a || this.budgetTotal() <= 0) {
      return { variant: 'neutral', labelKey: 'AFFAIRES.DETAIL.HEALTH.UNKNOWN' };
    }
    const pct = this.consumptionPct();
    if (pct >= 100)               return { variant: 'danger',  labelKey: 'AFFAIRES.DETAIL.HEALTH.CRITICAL' };
    if (pct >= a.rafAlerteSeuilPct) return { variant: 'warning', labelKey: 'AFFAIRES.DETAIL.HEALTH.WATCH' };
    return { variant: 'success', labelKey: 'AFFAIRES.DETAIL.HEALTH.OPTIMAL' };
  });

  /** Pastille de la tuile « Santé du projet ». */
  readonly healthBadge = computed<PageHeaderBadge>(() => {
    const h = this.healthState();
    return { label: this.translate.instant(h.labelKey), variant: h.variant, size: 'sm' };
  });

  /**
   * L'anneau de la tuile « Santé du projet ».
   *
   * **Valeur seule au centre** : pas de `sublabel`. Le libellé était redondant — l'en-tête
   * de la tuile dit déjà de quoi il s'agit, et la pastille d'état la qualifie.
   *
   * Pas de `ramp` non plus : ici un pourcentage haut est une **bonne** nouvelle (l'affaire
   * est facturée), alors que la rampe de teintes va du rouge au vert en montant, ce qui
   * dirait l'inverse. La couleur suit donc l'état de santé, qui tient compte du seuil
   * d'alerte de l'affaire. Le label centré reste le défaut du composant (le % arrondi), et
   * `ariaLabel` porte le sens pour les lecteurs d'écran, que le visuel ne dit plus.
   */
  readonly healthGaugeOptions = computed<GaugeOptions>(() => {
    const h = this.healthState();
    return {
      size:      '116px',
      thickness: 10,
      variant:   h.variant === 'danger' ? 'danger' : h.variant === 'warning' ? 'warning' : 'tertiary',
      ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.INDICATORS.BILLING_RATE')} : `
               + `${Math.round(this.billingPct())}%`,
    };
  });

  /**
   * L'anneau de la carte « Progression facturation » de la colonne droite.
   *
   * ⚠️ Il affiche la **même valeur** que l'anneau « Santé du projet » de l'onglet Vue
   * générale (`billingPct`) : le premier est le chiffre d'en-tête de la fiche, le second
   * porte l'état de santé par sa couleur et sa pastille. Deux anneaux identiques à deux
   * endroits, c'est signalé à la livraison — si l'un doit changer de valeur, c'est ici ou
   * dans `healthGaugeOptions`, pas dans le template.
   */
  readonly billingGaugeOptions = computed<GaugeOptions>(() => ({
    size:      '132px',
    thickness: 12,
    variant:   this.billingPct() >= 100 ? 'danger' : 'tertiary',
    ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.IDENTITY.BILLING_PROGRESS')} : `
             + `${Math.round(this.billingPct())}%`,
  }));

  // ── Barres de progression ────────────────────────────────────────────────
  readonly alertBarOptions: ProgressBarOptions = { variant: 'warning',   size: 'xs', showLabel: false, showPercent: false };
  readonly tsBarOptions: ProgressBarOptions    = { variant: 'secondary', size: 'sm' };
  readonly rafBarOptions: ProgressBarOptions   = { variant: 'primary',   size: 'sm' };

  /** Barre de la carte d'identité : le % est déjà affiché en gros au-dessus. */
  readonly identityBarOptions = computed<ProgressBarOptions>(() => ({
    ...this.billingBarOptions(), showLabel: false, showPercent: false,
  }));

  readonly billingBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.INVOICED')} — `
    + `${this.money(this.raf()?.totalFacturesEmises)} / ${this.money(this.budgetTotal())}`);

  readonly tsBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.TS_INTEGRATED')} — `
    + `${this.money(this.raf()?.montantTsIntegres)}`);

  readonly rafBarLabel = computed(() =>
    `${this.translate.instant('AFFAIRES.DETAIL.RAF_SECTION.REMAINING')} — `
    + `${this.money(this.raf()?.rafDisponible)}`);

  readonly billingBarOptions = computed<ProgressBarOptions>(() => ({
    variant: this.billingPct() >= 100 ? 'danger' : 'tertiary',
    size:    'sm',
  }));

  readonly consumptionBarOptions = computed<ProgressBarOptions>(() => {
    const v = this.healthState().variant;
    return { variant: v === 'danger' ? 'danger' : v === 'warning' ? 'warning' : 'tertiary', size: 'sm' };
  });

  // ── Facturation mensuelle ────────────────────────────────────────────────

  /** Année affichée : celle de la dernière facture émise, sinon l'année courante. */
  readonly chartYear = computed(() => {
    const years = this.invoices()
      .map(i => (i.dateEmission ? new Date(i.dateEmission).getFullYear() : null))
      .filter((y): y is number => y !== null);
    return years.length ? Math.max(...years) : new Date().getFullYear();
  });

  readonly monthlyValues = computed(() => {
    const year   = this.chartYear();
    const totals = Array(12).fill(0) as number[];
    for (const inv of this.invoices()) {
      if (!inv.dateEmission) continue;
      const d = new Date(inv.dateEmission);
      if (d.getFullYear() !== year) continue;
      totals[d.getMonth()] += inv.montantTtc ?? 0;
    }
    return totals;
  });

  readonly chartTotal = computed(() => this.monthlyValues().reduce((s, v) => s + v, 0));

  /**
   * Barres du panneau « Facturation mensuelle ».
   *
   * `label` ne porte QUE le mois : c'est la légende d'axe, et le montant va dans
   * `valueLabel`, que le composant met dans sa pastille au survol. Les deux étaient
   * concaténés dans un seul label du temps des `daf-progress-bar` horizontales.
   *
   * `highlight` sur le mois courant, et seulement si le graphique montre l'année en cours —
   * sinon on surlignerait août 2025 sur un graphique 2026.
   */
  readonly monthlyBars = computed<BarChartBar[]>(() => {
    const now         = new Date();
    const currentYear = now.getFullYear() === this.chartYear();
    return this.monthlyValues().map((value, index) => ({
      label:      MONTH_LABELS[index],
      value,
      valueLabel: this.money(value),
      highlight:  currentYear && index === now.getMonth(),
    }));
  });

  readonly monthlyChartOptions = computed<BarChartOptions>(() => {
    this.translate.currentLang();
    const target = this.monthlyTarget();
    return {
      orientation: 'vertical',
      height:      '200px',
      variant:     'tertiary',
      // `max` est laissé au composant : son défaut est déjà max(valeurs, target).
      target:      target > 0 ? target : undefined,
      targetLabel: target > 0
        ? `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.LEGEND_TARGET')} : ${this.money(target)}`
        : undefined,
      emptyMessage: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.NO_CHART_DATA'),
      ariaLabel: `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.CHART_TITLE', { year: this.chartYear() })} — `
               + `${this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.CUMUL')} ${this.money(this.chartTotal())}`,
    };
  });

  /** Objectif mensuel = budget réparti sur la durée de l'affaire (légende du panneau). */
  readonly monthlyTarget = computed(() => {
    const a = this.affaire();
    const b = this.budgetTotal();
    if (!a || b <= 0) return 0;
    const months = this.affaireMonths(a.dateDebut, a.dateFin);
    return months > 0 ? b / months : 0;
  });

  /** Nombre de mois couverts par l'affaire, borné à [1, 60]. */
  private affaireMonths(debut: string | null, fin: string | null): number {
    if (!debut || !fin) return 12;
    const d = new Date(debut), f = new Date(fin);
    const months = (f.getFullYear() - d.getFullYear()) * 12 + (f.getMonth() - d.getMonth()) + 1;
    return Math.min(Math.max(months, 1), 60);
  }

  // ═══ Onglets ══════════════════════════════════════════════════════════════

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const tabs: TabItem[] = [
      { id: 'overview', label: t('AFFAIRES.DETAIL.TABS.OVERVIEW') },
      { id: 'ts',       label: t('AFFAIRES.DETAIL.TABS.BUDGET_TS'), count: this.tsList().length },
    ];
    if (this.affaire()?.billingMode) {
      tabs.push({ id: 'billing', label: t('AFFAIRES.DETAIL.TABS.BILLING') });
    }
    tabs.push(
      { id: 'factures',  label: t('AFFAIRES.DETAIL.TABS.INVOICES'), count: this.invoices().length },
      { id: 'paiements', label: t('AFFAIRES.DETAIL.TABS.PAYMENTS'), count: this.payments().length },
    );
    return tabs;
  });

  // ═══ Barres d'outils (recherche + filtre + export) ════════════════════════

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:       t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
      applyLabel:  t('AFFAIRES.DETAIL.TOOLBAR.APPLY'),
      cancelLabel: t('AFFAIRES.DETAIL.MODAL.CANCEL'),
      resetLabel:  t('AFFAIRES.DETAIL.TOOLBAR.RESET'),
      triggerLabel: t('AFFAIRES.DETAIL.TOOLBAR.FILTERS'),
    };
  });

  private exportAction(disabled: boolean): ToolbarAction[] {
    return [{
      id:       'export',
      icon:     'download',
      label:    this.translate.instant('AFFAIRES.DETAIL.TOOLBAR.EXPORT'),
      position: 'right',
      disabled,
    }];
  }

  readonly tsToolbarActions      = computed(() => this.exportAction(this.filteredTs().length === 0));
  readonly invoiceToolbarActions = computed(() => this.exportAction(this.filteredInvoices().length === 0));
  readonly paymentToolbarActions = computed(() => this.exportAction(this.filteredPayments().length === 0));

  readonly tsFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.DETAIL.INVOICES.STATUS'),
    type:    'select',
    options: [...new Set(this.tsList().map(t => t.statut))].sort()
      .map(value => ({ value, label: TS_STATUT_CONFIG[value]?.label ?? value })),
  }]);

  readonly invoiceFilterFields = computed<FilterField[]>(() => [{
    name:    'statut',
    label:   this.translate.instant('AFFAIRES.DETAIL.INVOICES.STATUS'),
    type:    'select',
    options: [...new Set(this.invoices().map(i => i.statut).filter((s): s is string => !!s))]
      .sort().map(value => ({ value, label: value })),
  }]);

  readonly paymentFilterFields = computed<FilterField[]>(() => [{
    name:    'method',
    label:   this.translate.instant('AFFAIRES.DETAIL.PAYMENTS.METHOD'),
    type:    'select',
    options: [...new Set(this.payments().map(p => p.paymentMethod).filter((m): m is string => !!m))]
      .sort().map(value => ({ value, label: value })),
  }]);

  /** `daf-filter` renders a select as `string[]` internally and emits a scalar — normalise both. */
  asFilterValue(result: FilterResult, key: string): string {
    const v = result[key];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  onTsToolbarAction(id: string): void      { if (id === 'export') this.exportTs(); }
  onInvoiceToolbarAction(id: string): void { if (id === 'export') this.exportInvoices(); }
  onPaymentToolbarAction(id: string): void { if (id === 'export') this.exportPayments(); }

  // ═══ Tableaux ═════════════════════════════════════════════════════════════

  readonly filteredTs = computed(() => {
    const q = this.tsSearch().trim().toLowerCase(), statut = this.tsStatut();
    return this.tsList().filter(t =>
      (!statut || t.statut === statut) &&
      (!q || `${t.referenceTs} ${t.intitule}`.toLowerCase().includes(q)));
  });

  readonly filteredInvoices = computed(() => {
    const q = this.invoiceSearch().trim().toLowerCase(), statut = this.invoiceStatut();
    return this.invoices().filter(i =>
      (!statut || i.statut === statut) &&
      (!q || `${i.invoiceNumber ?? ''} ${i.invoiceType ?? ''}`.toLowerCase().includes(q)));
  });

  readonly filteredPayments = computed(() => {
    const q = this.paymentSearch().trim().toLowerCase(), method = this.paymentMethod();
    return this.payments().filter(p =>
      (!method || p.paymentMethod === method) &&
      (!q || `${p.invoiceNumber ?? ''} ${p.bankReference ?? ''}`.toLowerCase().includes(q)));
  });

  // Aucune colonne `sortable` : la lib trie côté client sur les lignes qu'on lui
  // donne, et une colonne `badge` compare "[object Object]" (§10b).

  readonly tsColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'reference', label: t('AFFAIRES.DETAIL.MODAL.TS_TITLE') },
      { key: 'intitule',  label: t('AFFAIRES.DETAIL.MODAL.TS_INTITULE') },
      { key: 'montant',   label: t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), align: 'right' },
      { key: 'statut',    label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge' },
      { key: 'integre',   label: t('AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT') },
    ];
  });

  readonly tsRows = computed<TableRow[]>(() => this.filteredTs().map(ts => ({
    reference: ts.referenceTs,
    intitule:  ts.intitule,
    montant:   this.currency.transform(ts.montantEstime, ts.devise || this.affaireDevise()),
    statut:    { label: TS_STATUT_CONFIG[ts.statut]?.label ?? ts.statut,
                 options: { variant: 'neutral', dot: true } } satisfies BadgeCell,
    integre:   this.formatDate(ts.integreAuBudgetAt),
    _source:   ts,
  })));

  readonly tsConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.tsList().length === 0 ? 'AFFAIRES.DETAIL.OVERVIEW.NO_TS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.tsActions(),
  }));

  readonly invoiceColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'numero',   label: t('AFFAIRES.DETAIL.INVOICES.NUMBER') },
      { key: 'type',     label: t('AFFAIRES.DETAIL.INVOICES.TYPE') },
      { key: 'emission', label: t('AFFAIRES.DETAIL.INVOICES.EMITTED') },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE') },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), align: 'right' },
      { key: 'statut',   label: t('AFFAIRES.DETAIL.INVOICES.STATUS'), type: 'badge' },
    ];
  });

  readonly invoiceRows = computed<TableRow[]>(() => this.filteredInvoices().map(inv => ({
    numero:   inv.invoiceNumber ?? '—',
    type:     inv.invoiceType ?? '—',
    emission: this.formatDate(inv.dateEmission),
    echeance: this.formatDate(inv.dateEcheance),
    montant:  this.currency.transform(inv.montantTtc, inv.devise || this.affaireDevise()),
    statut:   { label: inv.statut ?? '—',
                options: { variant: 'neutral', dot: true } } satisfies BadgeCell,
    _editable: this.canEditInvoice(inv),
    _source:   inv,
  })));

  readonly invoiceConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.invoices().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_INVOICES' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.invoiceActions(),
  }));

  readonly paymentColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'date',     label: t('AFFAIRES.DETAIL.PAYMENTS.DATE') },
      { key: 'facture',  label: t('AFFAIRES.DETAIL.PAYMENTS.INVOICE') },
      { key: 'methode',  label: t('AFFAIRES.DETAIL.PAYMENTS.METHOD') },
      { key: 'ref',      label: t('AFFAIRES.DETAIL.PAYMENTS.REFERENCE') },
      { key: 'montant',  label: t('AFFAIRES.DETAIL.PAYMENTS.AMOUNT'), align: 'right' },
    ];
  });

  readonly paymentRows = computed<TableRow[]>(() => this.filteredPayments().map(p => ({
    date:    this.formatDate(p.paymentDate),
    facture: p.invoiceNumber ?? '—',
    methode: p.paymentMethod ?? '—',
    ref:     p.bankReference ?? '—',
    montant: this.currency.transform(p.amountLocal, p.currency || this.affaireDevise()),
    _source: p,
  })));

  readonly paymentConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable:  true,
    emptyMessage: this.translate.instant(
      this.payments().length === 0 ? 'AFFAIRES.DETAIL.SECTIONS.NO_PAYMENTS' : 'AFFAIRES.DETAIL.TOOLBAR.NO_MATCH'),
    actions: this.paymentActions(),
  }));

  // ── Actions de ligne ─────────────────────────────────────────────────────
  //
  // Sur `config.actions`, plus dans une colonne `dafCell="_actions"` projetée : les
  // prédicats `hidden` / `disabled` par ligne de `TableAction` (4.17.0) rendent le
  // conditionnel possible sans réimplémenter à la main le style de bouton de la lib
  // (§6b rule 4). Les trois colonnes projetées de cette page ont disparu avec.
  //
  // `id` résout l'icône quand elle est standard (`view` → visibility, `edit` → stylus) ;
  // les validations TS passent une icône explicite. La cellule d'actions de la lib
  // s'occupe déjà du stopPropagation.

  readonly tsActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openTsView(row['_source'] as TsDto),
      },
      {
        id: 'validate-tech', icon: 'fact_check', tooltip: t('AFFAIRES.DETAIL.TS.VALIDATE_TECH'),
        hidden:  row => !this.canValidateTechnique(row['_source'] as TsDto),
        onClick: row => this.openTsValidation(row['_source'] as TsDto, 'technique'),
      },
      {
        id: 'validate-comm', icon: 'handshake', tooltip: t('AFFAIRES.DETAIL.TS.VALIDATE_COMM'),
        hidden:  row => !this.canValidateCommerciale(row['_source'] as TsDto),
        onClick: row => this.openTsValidation(row['_source'] as TsDto, 'commerciale'),
      },
    ];
  });

  readonly invoiceActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openInvoiceView(row['_source'] as AffaireInvoiceItem),
      },
      {
        // Grisée plutôt que cachée : une facture non modifiable reste une facture, et
        // faire disparaître l'action d'une ligne sur deux se lit comme un bug.
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        disabled: row => !this.canEditInvoice(row['_source'] as AffaireInvoiceItem),
        onClick:  row => this.editInvoice(row['_source'] as AffaireInvoiceItem),
      },
    ];
  });

  readonly paymentActions = computed<TableAction[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        id: 'view', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.VIEW'),
        onClick: row => this.openPaymentView(row['_source'] as AffairePaymentItem),
      },
      {
        id: 'edit', tooltip: t('AFFAIRES.DETAIL.TOOLBAR.EDIT'),
        onClick: () => this.goToPayments(),
      },
    ];
  });

  // ═══ Drawer : échéances + activité ════════════════════════════════════════

  readonly activityDrawerConfig = computed<DrawerConfig>(() => {
    this.translate.currentLang();
    return {
      title:      this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_TITLE'),
      icon:       'insights',
      side:       'right',
      width:      '460px',
      closeLabel: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.DRAWER_BTN'),
      // L'onglet de bord de la lib remplace le bouton qu'il y avait dans pageActions
      // (~200 px de la ligne de titre). Pas de collision avec le FAB de devise du
      // shell : le tab est `fixed top-1/2` (centré verticalement), le FAB est en bas.
      showToggle: true,
      // Le marqueur d'alerte (4.18.0). Point simple, sans `count` : il n'y a qu'une
      // condition à signaler, et « il y a quelque chose » se lit plus vite qu'un « 1 ».
      // Il reste visible panneau ouvert — c'est une condition active, pas du non-lu :
      // il disparaît quand le RAF repasse sous le seuil, pas quand on a regardé.
      signal: this.rafAlertActive()
        ? {
            tone:  'danger',
            label: this.translate.instant('AFFAIRES.DETAIL.SIDEBAR.RAF_ALERT_TITLE'),
            pulse: true,
          }
        : undefined,
    };
  });

  readonly deadlineColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'tache',    label: t('AFFAIRES.DETAIL.OVERVIEW.TASK') },
      { key: 'echeance', label: t('AFFAIRES.DETAIL.INVOICES.DUE') },
      { key: 'priorite', label: t('AFFAIRES.DETAIL.OVERVIEW.PRIORITY'), type: 'badge', align: 'right' },
    ];
  });

  readonly deadlineRows = computed<TableRow[]>(() => {
    const a    = this.affaire();
    const now  = Date.now();
    const t    = (k: string, p?: Record<string, string>) => this.translate.instant(k, p);
    const rows: { date: string; tache: string; priority: string }[] = [];

    for (const inv of this.invoices()) {
      if (!inv.dateEcheance) continue;
      if (inv.statut && SETTLED_INVOICE_STATUTS.has(inv.statut)) continue;
      rows.push({
        date:     inv.dateEcheance,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_INVOICE', { ref: inv.invoiceNumber ?? '—' }),
        priority: this.priorityOf(inv.dateEcheance, now),
      });
    }

    if (a?.dateFin && a.statut !== 'CLOTUREE' && a.statut !== 'ARCHIVEE') {
      rows.push({
        date:     a.dateFin,
        tache:    t('AFFAIRES.DETAIL.OVERVIEW.DEADLINE_END'),
        priority: this.priorityOf(a.dateFin, now),
      });
    }

    return rows
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime())
      .slice(0, 6)
      .map(r => ({
        tache:    r.tache,
        echeance: this.formatDate(r.date),
        priorite: {
          label:   t(`AFFAIRES.DETAIL.OVERVIEW.PRIORITY_${r.priority.toUpperCase()}`),
          options: { variant: PRIORITY_BADGE[r.priority], dot: true },
        } satisfies BadgeCell,
      }));
  });

  readonly deadlineConfig = computed<TableConfig>(() => ({
    showHeader:   false,
    emptyMessage: this.translate.instant('AFFAIRES.DETAIL.OVERVIEW.NO_DEADLINES'),
  }));

  readonly activities = computed<ActivityRow[]>(() => {
    const a    = this.affaire();
    const cur  = this.affaireDevise();
    const rows: ActivityRow[] = [];

    for (const p of this.payments()) {
      if (!p.paymentDate) continue;
      rows.push({
        id: `pay-${p.id}`, icon: 'payments',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_PAYMENT',
        params: { ref: p.invoiceNumber ?? '—' },
        sub: `${this.money(p.amountLocal, p.currency || cur)} • ${this.formatDate(p.paymentDate)}`,
        ts: new Date(p.paymentDate).getTime(),
      });
    }

    for (const inv of this.invoices()) {
      if (!inv.dateEmission) continue;
      rows.push({
        id: `inv-${inv.id}`, icon: 'receipt_long',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_INVOICE',
        params: { ref: inv.invoiceNumber ?? '—' },
        sub: `${this.money(inv.montantTtc, inv.devise || cur)} • ${this.formatDate(inv.dateEmission)}`,
        ts: new Date(inv.dateEmission).getTime(),
      });
    }

    for (const ts of this.tsList()) {
      const integrated = !!ts.integreAuBudgetAt;
      const when = integrated ? ts.integreAuBudgetAt! : ts.createdAt;
      rows.push({
        id: `ts-${ts.id}`, icon: 'add_task',
        titleKey: integrated
          ? 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_INTEGRATED'
          : 'AFFAIRES.DETAIL.OVERVIEW.ACT_TS_CREATED',
        params: { ref: ts.referenceTs },
        sub: `${this.money(ts.montantEstime, ts.devise || cur)} • ${this.formatDate(when)}`,
        ts: new Date(when).getTime(),
      });
    }

    if (a) {
      if (a.updatedAt) {
        rows.push({
          id: 'affaire-updated', icon: 'edit_note',
          titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_UPDATED', params: {},
          sub: this.formatDate(a.updatedAt), ts: new Date(a.updatedAt).getTime(),
        });
      }
      rows.push({
        id: 'affaire-created', icon: 'flag',
        titleKey: 'AFFAIRES.DETAIL.OVERVIEW.ACT_CREATED', params: {},
        sub: `${this.money(a.budgetPrevisionnel)} • ${this.formatDate(a.createdAt)}`,
        ts: new Date(a.createdAt).getTime(),
      });
    }

    return rows.sort((x, y) => y.ts - x.ts).slice(0, 8);
  });

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  readonly availableTransitions = computed(() => {
    const a = this.affaire();
    return a ? (STATUT_TRANSITIONS[a.statut] ?? []) : [];
  });

  ngOnInit(): void { this.loadAll(); }

  loadAll(): void {
    const id = this.numId;
    if (!id) {
      this.error.set(this.translate.instant('AFFAIRES.DETAIL.INVALID_ID'));
      this.firstLoad.set(false);
      return;
    }
    this.error.set(null);

    this.svc.getAffaire(id).subscribe({
      next: a => {
        this.affaire.set(a);
        this.firstLoad.set(false);
        this.loadRaf();
        this.loadKpis();
        this.loadTs();
        this.loadInvoices();
        this.loadPayments();
        this.loadTeamAvatars(a);
      },
      error: () => {
        this.error.set(this.translate.instant('AFFAIRES.DETAIL.LOAD_ERROR'));
        this.firstLoad.set(false);
      },
    });
  }

  loadRaf():      void { this.svc.getAffaireRaf(this.numId).subscribe({ next: r => this.raf.set(r) }); }
  loadKpis():     void { this.svc.getAffaireKpis(this.numId).subscribe({ next: k => this.kpis.set(k) }); }
  loadTs():       void { this.svc.getTS(this.numId).subscribe({ next: ts => this.tsList.set(ts) }); }
  loadInvoices(): void { this.svc.getAffaireInvoices(this.numId).subscribe({ next: i => this.invoices.set(i) }); }
  loadPayments(): void { this.svc.getAffairePayments(this.numId).subscribe({ next: p => this.payments.set(p) }); }

  /**
   * Photos de l'équipe, via rh-service. Sans `error` handler : le service ne rejette
   * jamais (une panne RH renvoie une liste vide) et l'absence de photo se dégrade en
   * initiales, donc il n'y a rien à signaler à l'utilisateur.
   */
  loadTeamAvatars(a: AffaireDetail): void {
    const ids = this.teamUserIds(a);
    if (ids.length === 0) return;
    this.avatarSvc.resolve(ids).subscribe({
      next: rows => {
        this.avatars.set(new Map(rows.map(r => [r.userId, r])));

        // `daf-avatar` retombe sur les initiales dans trois cas indistinguables à l'écran :
        // pas de ligne pour cet utilisateur, `photo_url` nul en base, ou image en erreur.
        // En `debug` (masqué par défaut dans la console de Chrome, visible en « Verbose »)
        // pour ne pas faire de bruit tout en gardant la boucle de diagnostic fermée :
        // l'URL affichée est cliquable, et c'est elle qui dit si le fichier existe.
        for (const id of ids) {
          const row = rows.find(r => r.userId === id);
          console.debug(`[avatars] user ${id} →`,
            !row              ? 'aucune ligne RH (utilisateur inconnu ou profil supprimé)'
            : !row.profileId  ? 'pas de profil RH (initiales attendues)'
            : !row.photoUrl   ? 'profil sans photo (initiales attendues)'
            :                   this.avatarSvc.photoUrl(row));
        }
      },
    });
  }

  // ═══ Actions ══════════════════════════════════════════════════════════════

  validerBudget(): void {
    if (this.budgetLoading()) return;
    this.budgetLoading.set(true);
    this.actionError.set(null);
    this.svc.validerBudget(this.numId).subscribe({
      next: () => { this.budgetLoading.set(false); this.loadAll(); },
      error: err => {
        this.budgetLoading.set(false);
        this.actionError.set(err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.BUDGET_ERROR'));
      },
    });
  }

  openStatutModal(): void {
    const transitions = this.availableTransitions();
    if (transitions.length === 0) return;
    this.targetStatut.set(transitions[0]);
    this.motif.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.DETAIL.MODAL.STATUS_TITLE'),
      icon:  'swap_horiz',
      size:  'md',
      body:  this.statutTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitStatut(ref),
        },
      ],
    });
  }

  private submitStatut(ref: { close: () => void }): void {
    const statut = this.targetStatut();
    if (!statut) return;
    this.modalError.set(null);
    this.svc.changerStatut(this.numId, { newStatut: statut, reason: this.motif().trim() || null }).subscribe({
      next: () => { ref.close(); this.loadAll(); },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.STATUS_ERROR')),
    });
  }

  readonly statutRadioOptions = computed<RadioOption[]>(() => {
    this.translate.currentLang();
    return this.availableTransitions().map(s => ({
      value: s,
      label: this.translate.instant(STATUT_LABELS[s] ?? s),
    }));
  });

  readonly motifFieldOptions = computed<FormFieldOptions>(() => ({
    label:       this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON'),
    type:        'textarea',
    rows:        3,
    maxLength:   500,
    fullWidth:   true,
    placeholder: this.translate.instant('AFFAIRES.DETAIL.MODAL.REASON_PLACEHOLDER'),
  }));

  // ── Validation d'un TS ───────────────────────────────────────────────────

  canValidateTechnique(ts: TsDto): boolean {
    return ts.statut === 'CREATED' && this.store.hasPermission('FACT_VALID_TECHNIQUE_TS');
  }

  canValidateCommerciale(ts: TsDto): boolean {
    return ts.statut === 'VALID_TECHNIQUE' && this.store.hasPermission('FACT_VALID_COMMERCIALE_TS');
  }

  readonly tsValidationSummary = computed(() => {
    const target = this.tsValidationTarget();
    if (!target) return '';
    return `${target.ts.referenceTs} · ${target.ts.intitule} — `
      + this.money(target.ts.montantEstime, target.ts.devise || this.affaireDevise());
  });

  readonly tsNotesFieldOptions = computed<FormFieldOptions>(() => ({
    label:     this.translate.instant('AFFAIRES.DETAIL.TS.NOTES'),
    type:      'textarea',
    rows:      3,
    maxLength: 500,
    fullWidth: true,
  }));

  openTsValidation(ts: TsDto, step: 'technique' | 'commerciale'): void {
    this.tsValidationTarget.set({ ts, step });
    this.tsNotes.set('');
    this.modalError.set(null);

    const ref = this.modals.open({
      title: this.translate.instant(step === 'technique'
        ? 'AFFAIRES.DETAIL.TS.VALIDATE_TECH'
        : 'AFFAIRES.DETAIL.TS.VALIDATE_COMM'),
      icon: step === 'technique' ? 'fact_check' : 'handshake',
      size: 'md',
      body: this.tsValidationTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CONFIRM'),
          variant: 'primary',
          action: () => this.submitTsValidation(ref),
        },
      ],
    });
  }

  private submitTsValidation(ref: { close: () => void }): void {
    const target = this.tsValidationTarget();
    if (!target) return;
    const notes = this.tsNotes().trim() || null;
    const call  = target.step === 'technique'
      ? this.svc.validerTechnique(target.ts.id, { notes })
      : this.svc.validerCommerciale(target.ts.id, { notes });

    this.modalError.set(null);
    call.subscribe({
      next: () => { ref.close(); this.tsValidationTarget.set(null); this.loadTs(); this.loadRaf(); },
      error: err => this.modalError.set(
        err?.error?.message ?? this.translate.instant('AFFAIRES.DETAIL.TS.VALIDATE_ERROR')),
    });
  }

  // ── Consultation d'une ligne ─────────────────────────────────────────────

  private openRowModal(row: RowDetail): void {
    this.modalRowState.set(row);
    const buttons = [
      { label: this.translate.instant('AFFAIRES.DETAIL.MODAL.CLOSE'), variant: 'secondary' as const,
        action: (r: { close: () => void }) => r.close() },
    ];
    if (row.openAction) {
      buttons.push({
        label: this.translate.instant(row.openAction.labelKey),
        variant: 'primary' as unknown as 'secondary',
        action: (r: { close: () => void }) => { r.close(); row.openAction!.run(); },
      });
    }
    this.modals.open({
      title: `${this.translate.instant(row.titleKey)} — ${row.ref}`,
      icon:  'visibility',
      size:  'md',
      body:  this.rowDetailTpl(),
      buttons,
    });
  }

  openInvoiceView(inv: AffaireInvoiceItem): void {
    const devise = inv.devise || this.affaireDevise();
    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.INVOICE_TITLE',
      ref:      inv.invoiceNumber ?? `#${inv.id}`,
      fields: [
        { label: 'AFFAIRES.DETAIL.INVOICES.TYPE',    value: inv.invoiceType ?? '—' },
        { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',  value: inv.statut ?? '—' },
        { label: 'AFFAIRES.DETAIL.INVOICES.EMITTED', value: this.formatDate(inv.dateEmission) },
        { label: 'AFFAIRES.DETAIL.INVOICES.DUE',     value: this.formatDate(inv.dateEcheance) },
        { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT',  value: this.money(inv.montantTtc, devise) },
        { label: 'AFFAIRES.DETAIL.INFO.CURRENCY',    value: devise },
      ],
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_INVOICE', run: () => this.goToInvoice(inv.id) },
    });
  }

  openPaymentView(p: AffairePaymentItem): void {
    const devise = p.currency || this.affaireDevise();
    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.PAYMENT_TITLE',
      ref:      p.invoiceNumber ?? `#${p.id}`,
      fields: [
        { label: 'AFFAIRES.DETAIL.PAYMENTS.DATE',      value: this.formatDate(p.paymentDate) },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.INVOICE',   value: p.invoiceNumber ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.METHOD',    value: p.paymentMethod ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.REFERENCE', value: p.bankReference ?? '—' },
        { label: 'AFFAIRES.DETAIL.PAYMENTS.AMOUNT',    value: this.money(p.amountLocal, devise) },
        { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT', value: this.formatDate(p.recordedAt) },
        { label: 'AFFAIRES.DETAIL.INFO.NOTES',         value: p.notes ?? '—' },
      ],
      openAction: { labelKey: 'AFFAIRES.DETAIL.MODAL.OPEN_PAYMENTS', run: () => this.goToPayments() },
    });
  }

  openTsView(ts: TsDto): void {
    this.openRowModal({
      titleKey: 'AFFAIRES.DETAIL.MODAL.TS_TITLE',
      ref:      ts.referenceTs,
      fields: [
        { label: 'AFFAIRES.DETAIL.MODAL.TS_INTITULE',      value: ts.intitule },
        { label: 'AFFAIRES.DETAIL.INVOICES.AMOUNT',        value: this.money(ts.montantEstime, ts.devise || this.affaireDevise()) },
        { label: 'AFFAIRES.DETAIL.INVOICES.STATUS',        value: TS_STATUT_CONFIG[ts.statut]?.label ?? ts.statut },
        { label: 'AFFAIRES.DETAIL.MODAL.TS_PERIMETRE',     value: ts.perimetre ?? '—' },
        { label: 'AFFAIRES.DETAIL.MODAL.TS_IMPACT',        value: ts.impactBudgetaire ?? '—' },
        { label: 'AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT', value: this.formatDate(ts.integreAuBudgetAt) },
        { label: 'AFFAIRES.DETAIL.SIDEBAR.CREATED_AT',     value: this.formatDate(ts.createdAt) },
        { label: 'AFFAIRES.DETAIL.INFO.NOTES',             value: ts.description ?? '—' },
      ],
    });
  }

  // ── Édition d'une ligne ──────────────────────────────────────────────────
  //
  // Il n'existe pas d'API de mise à jour ligne-à-ligne : une facture ne se modifie
  // que par son propre écran (et seulement tant qu'elle est modifiable), un paiement
  // se gère dans le module Paiements.

  canEditInvoice(inv: AffaireInvoiceItem): boolean {
    return EDITABLE_INVOICE_STATUTS.has(inv.statut ?? '');
  }

  editInvoice(inv: AffaireInvoiceItem): void {
    if (this.canEditInvoice(inv)) this.goToInvoice(inv.id);
  }

  // ── Navigation ───────────────────────────────────────────────────────────

  // Plus de `goBack()` : le retour à la liste est le lien du fil d'Ariane. La méthode
  // pointait `['../..']` (soit `/finance`) et écrasait ce lien.
  openEdit():     void { this.router.navigate(['edit'],   { relativeTo: this.route }); }
  openTsForm():   void { this.showTsForm.set(true); }

  goToInvoicing(): void {
    this.router.navigate(['../../invoicing'], { relativeTo: this.route, queryParams: { affaire: this.numId } });
  }

  private goToInvoice(id: number): void {
    this.router.navigate(['../../invoicing', id], { relativeTo: this.route });
  }

  goToPayments(): void {
    this.router.navigate(['../../payments'], { relativeTo: this.route, queryParams: { affaire: this.numId } });
  }

  onTsFormClosed(saved: boolean): void {
    this.showTsForm.set(false);
    if (saved) { this.loadTs(); this.loadRaf(); }
  }

  // ═══ Export CSV ═══════════════════════════════════════════════════════════

  exportTs(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `TS_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.MODAL.TS_TITLE'), t('AFFAIRES.DETAIL.MODAL.TS_INTITULE'),
       t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY'),
       t('AFFAIRES.DETAIL.INVOICES.STATUS'), t('AFFAIRES.DETAIL.MODAL.TS_INTEGRATED_AT')],
      this.filteredTs().map(ts => [
        ts.referenceTs, ts.intitule, ts.montantEstime, ts.devise,
        TS_STATUT_CONFIG[ts.statut]?.label ?? ts.statut, this.formatDate(ts.integreAuBudgetAt),
      ]),
    );
  }

  exportInvoices(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `Factures_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.INVOICES.NUMBER'), t('AFFAIRES.DETAIL.INVOICES.TYPE'),
       t('AFFAIRES.DETAIL.INVOICES.EMITTED'), t('AFFAIRES.DETAIL.INVOICES.DUE'),
       t('AFFAIRES.DETAIL.INVOICES.AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY'),
       t('AFFAIRES.DETAIL.INVOICES.STATUS')],
      this.filteredInvoices().map(i => [
        i.invoiceNumber, i.invoiceType, this.formatDate(i.dateEmission), this.formatDate(i.dateEcheance),
        i.montantTtc, i.devise || this.affaireDevise(), i.statut,
      ]),
    );
  }

  exportPayments(): void {
    const t = (k: string) => this.translate.instant(k);
    this.downloadCsv(
      `Paiements_${this.affaire()?.reference ?? this.numId}`,
      [t('AFFAIRES.DETAIL.PAYMENTS.DATE'), t('AFFAIRES.DETAIL.PAYMENTS.INVOICE'),
       t('AFFAIRES.DETAIL.PAYMENTS.METHOD'), t('AFFAIRES.DETAIL.PAYMENTS.REFERENCE'),
       t('AFFAIRES.DETAIL.PAYMENTS.AMOUNT'), t('AFFAIRES.DETAIL.INFO.CURRENCY')],
      this.filteredPayments().map(p => [
        this.formatDate(p.paymentDate), p.invoiceNumber, p.paymentMethod, p.bankReference,
        p.amountLocal, p.currency || this.affaireDevise(),
      ]),
    );
  }

  /**
   * CSV séparé par `;` avec BOM UTF-8 : c'est ce qu'Excel en locale FR ouvre sans
   * assistant d'import ni accents cassés.
   */
  private downloadCsv(baseName: string, headers: string[], rows: (string | number | null)[][]): void {
    const cell = (v: string | number | null) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv  = [headers, ...rows].map(r => r.map(cell).join(';')).join('\r\n');

    const url  = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href     = url;
    link.download = `${baseName}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  // ═══ Formatage ════════════════════════════════════════════════════════════

  /** Montant dans la devise d'affichage courante — même pipe que le reste du module. */
  private money(v: number | null | undefined, devise?: string): string {
    return this.currency.transform(v ?? null, devise ?? this.affaireDevise());
  }

  formatPct(v: number | null): string {
    if (v === null || v === undefined) return '—';
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v) + '%';
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private priorityOf(date: string, now: number): 'high' | 'medium' | 'standard' {
    const days = (new Date(date).getTime() - now) / 86_400_000;
    return days < 0 ? 'high' : days <= 15 ? 'medium' : 'standard';
  }
}
