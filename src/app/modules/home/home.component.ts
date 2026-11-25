import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, DrawerComponent, MetricCardComponent, PageComponent,
  PageHeaderComponent, SkeletonComponent, selectCurrentUser, selectSelectedCountryId,
} from '@khalilrebhiitec/daf360';
import type {
  CardOptions, DrawerConfig, MetricCardOptions, MetricDelta,
} from '@khalilrebhiitec/daf360';
import { PaymentService } from '../payments/payment.service';
import { CurrencyContextService } from '../../core/currency-context.service';
import { PaymentsDashboardStats } from '../payments/payment.model';
import { InvoiceService } from '../invoicing/invoice.service';
import { InvoiceListItem, INVOICE_STATUT_CONFIG } from '../invoicing/invoice.model';
import { AffaireService } from '../affaires/affaire.service';
import { PaysRefDto, paysLabel } from '../affaires/affaire.model';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { HOME_MODULES } from '../finance-modules';
import type { FinanceModuleDef } from '../finance-modules';
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import type { GuideStep } from '../../shared/guide/page-guide.types';
import { HeaderPaysService } from '../../core/header-pays.service';

export interface ActivityItem {
  icon:      string;
  /** Classe de couleur littérale complète (§3) — jamais assemblée à l'exécution. */
  toneClass: string;
  title:     string;
  sub:       string;
  amount:    string | null;
  invoice:   InvoiceListItem;
}

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

interface ModuleCard {
  id:      string;
  route:   string;
  options: CardOptions;
  /** Raccourci `flex` de la carte — voir {@link SPAN_FLEX}. */
  flex:    string;
}

/**
 * Largeur d'une carte, en parts d'une ligne de **4**, exprimée en flex (jamais en grid).
 *
 * Le calcul doit rester d'accord avec la gouttière de la rangée, `gap: 1.5rem` = 24 px :
 * quatre cartes laissent trois gouttières, donc chacune perd 3 × 24 / 4 = **18 px** sur son
 * quart. Une carte sur deux parts reprend la gouttière qu'elle enjambe :
 * 2 × (25 % − 18) + 24 = **50 % − 12 px**.
 *
 * `flex-grow: 0` est délibéré : avec `grow: 1`, une dernière ligne incomplète verrait ses
 * cartes s'étirer et la grille de 4 colonnes ne se lirait plus. `min-width` fait le repli
 * responsive — dès que le quart passe sous 220 px, il gagne et les cartes se replient à 3
 * puis 2 par ligne, sans media query.
 */
const SPAN_FLEX: Record<1 | 2, string> = {
  1: '0 1 calc(25% - 18px)',
  2: '0 1 calc(50% - 12px)',
};

/**
 * Teinte d'un module → classes d'icône de `daf-card`. Littéraux complets, et **tokens de
 * la lib** : les neuf variantes locales (`icon-bg--fact`, `--pay`, `--amber`…) vivaient
 * dans le SCSS de cette page, que ce passage supprime.
 */
const TONE_ICON: Record<FinanceModuleDef['tone'], { iconColor: string; iconBg: string }> = {
  primary:   { iconColor: 'text-primary',   iconBg: 'bg-primary/10'   },
  secondary: { iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
  tertiary:  { iconColor: 'text-tertiary',  iconBg: 'bg-tertiary/10'  },
  teal:      { iconColor: 'text-teal',      iconBg: 'bg-teal/10'      },
  warning:   { iconColor: 'text-warning',   iconBg: 'bg-warning/10'   },
  danger:    { iconColor: 'text-danger',    iconBg: 'bg-danger/10'    },
};

/**
 * Guide de la page. `target` = un `data-guide` du gabarit (ou de « Aide & guides » dans la
 * barre) ; `selector` = un élément dessiné par la lib, qui ne peut pas porter d'attribut.
 * Une cible absente à cette largeur (la barre sur mobile) donne une étape centrée.
 */
const GUIDE_STEPS: GuideStep[] = [
  { icon: 'waving_hand',       titleKey: 'GUIDE.HOME.WELCOME_TITLE',  textKey: 'GUIDE.HOME.WELCOME_TEXT' },
  { icon: 'monitoring',        titleKey: 'GUIDE.HOME.KPIS_TITLE',     textKey: 'GUIDE.HOME.KPIS_TEXT',     target: 'home-kpis' },
  { icon: 'apps',              titleKey: 'GUIDE.HOME.MODULES_TITLE',  textKey: 'GUIDE.HOME.MODULES_TEXT',  target: 'home-modules' },
  { icon: 'history',           titleKey: 'GUIDE.HOME.ACTIVITY_TITLE', textKey: 'GUIDE.HOME.ACTIVITY_TEXT',
    selector: 'daf-drawer button[aria-controls]' },
  { icon: 'currency_exchange', titleKey: 'GUIDE.HOME.CURRENCY_TITLE', textKey: 'GUIDE.HOME.CURRENCY_TEXT',
    // The sidebar row on desktop, the bubble on mobile: whichever is displayed.
    selector: '[data-guide="currency-switch"], daf-radial-menu button[aria-haspopup]' },
  { icon: 'help',              titleKey: 'GUIDE.HOME.HELP_TITLE',     textKey: 'GUIDE.HOME.HELP_TEXT',     target: 'help-center' },
];

/** Statut de facture → icône + teinte de la ligne d'activité. */
const ACTIVITY_CONFIG: Record<string, { icon: string; tone: string }> = {
  PAID:           { icon: 'check_circle',    tone: 'text-success' },
  APPROVED:       { icon: 'verified',        tone: 'text-success' },
  EMITTED:        { icon: 'send',            tone: 'text-primary' },
  SENT:           { icon: 'mark_email_read', tone: 'text-primary' },
  PARTIALLY_PAID: { icon: 'payments',        tone: 'text-teal'    },
  SUBMITTED:      { icon: 'hourglass_top',   tone: 'text-warning' },
  RETURNED:       { icon: 'undo',            tone: 'text-warning' },
  DRAFT:          { icon: 'edit_note',       tone: 'text-outline' },
  DISPUTED:       { icon: 'gavel',           tone: 'text-danger'  },
  CANCELLED:      { icon: 'cancel',          tone: 'text-danger'  },
  CREDIT_NOTED:   { icon: 'receipt',         tone: 'text-outline' },
};

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [
    TranslatePipe,
    PageComponent, PageHeaderComponent, MetricCardComponent, CardComponent,
    DrawerComponent, SkeletonComponent, ButtonComponent, PageGuideComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly paymentSvc     = inject(PaymentService);
  private readonly invoiceSvc     = inject(InvoiceService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly currencyContext = inject(CurrencyContextService);
  private readonly ngrx           = inject(Store);
  private readonly translate      = inject(TranslateService);
  private readonly currency       = inject(DisplayCurrencyPipe);

  private readonly affaireSvc     = inject(AffaireService);

  private readonly currentUser = toSignal(this.ngrx.select(selectCurrentUser));

  // ── Pays : les drapeaux de la barre (store partagé avec le shell) ─────────────
  /** Ids FINANCE de tous les drapeaux cochés (`178,63`) ; undefined = « Tous les pays ». */
  private readonly headerPaysList = inject(HeaderPaysService).paysList;

  /**
   * Pays des montants (tuiles KPI). Les KPI ne valent que pour UN pays : la devise sert
   * d'affichage, elle ne convertit pas, et des montants en TND et en EGP ne s'additionnent
   * pas. Donc :
   * - un drapeau → ce pays ;
   * - aucun → null : le serveur prend le pays de l'utilisateur, comme avant ;
   * - plusieurs → le pays de l'utilisateur s'il est coché, sinon le premier coché.
   * La mention « Montants : Tunisie (TND) » sous les tuiles dit lequel.
   * Le compteur « à valider » et l'activité récente, eux, suivent TOUS les drapeaux.
   */
  readonly paysId = computed<number | null>(() => {
    const ids = (this.headerPaysList() ?? '').split(',').map(Number).filter(id => Number.isInteger(id) && id > 0);
    if (ids.length <= 1) return ids[0] ?? null;
    const iso = (this.currentUser()?.isoCode ?? '').toUpperCase();
    const own = this.paysList().find(p => (p.isoCode ?? '').toUpperCase() === iso)?.id;
    return own != null && ids.includes(own) ? own : ids[0];
  });

  /** Libellés des pays, pour dire de quel pays sont les montants. */
  private readonly paysList = signal<PaysRefDto[]>([]);

  /**
   * « Montants : Tunisie (EUR) » sous les KPI.
   *
   * Les KPI ne valent que pour UN pays — des montants en devises différentes ne
   * s'additionnent pas. Avec « Tous les pays » dans la navbar, le serveur retombe sur le pays
   * de l'utilisateur ; sans cette mention, le chiffre aurait l'air d'un total groupe.
   */
  readonly kpiScopeLabel = computed<string | null>(() => {
    this.translate.currentLang();
    const s = this.stats();
    if (!s) return null;
    // Drapeau : id FINANCE (déjà traduit). « Tous les pays » : le pays de l'utilisateur, cherché
    // par code ISO — l'id du jeton est un id RH, qui ne désigne pas le même pays en finance.
    const id   = this.paysId();
    const iso  = (this.currentUser()?.isoCode ?? '').toUpperCase();
    const pays = id != null
      ? this.paysList().find(p => p.id === id)
      : this.paysList().find(p => (p.isoCode ?? '').toUpperCase() === iso);
    if (!pays) return null;
    return this.translate.instant('HOME.KPI.SCOPE', {
      country:  paysLabel(pays, this.translate.currentLang()),
      currency: s.devise ?? '',
    });
  });

  /** Bumped à chaque chargement : une réponse lente pour l'ancien pays est ignorée. */
  private loadSeq = 0;

  constructor() {
    // Premier chargement, puis un par changement de drapeau.
    effect(() => {
      const paysId = this.paysId();
      const paysList = this.headerPaysList() ?? null;
      untracked(() => this.load(paysId, paysList));
    });
  }

  stats           = signal<PaymentsDashboardStats | null>(null);
  loadingActivity = signal(true);
  recentActivity  = signal<ActivityItem[]>([]);
  pendingCount    = signal<number | null>(null);

  /**
   * Squelette pleine page au **premier** chargement seulement (§5) : il tombe dès que les
   * stats répondent. L'activité a le sien, dans le drawer, parce qu'elle arrive après et
   * que faire clignoter l'en-tête et les KPI pour elle serait absurde.
   */
  firstLoad = signal(true);

  activityDrawerOpen = signal(false);

  readonly guideSteps = GUIDE_STEPS;

  readonly firstName = computed(() => (this.currentUser()?.fullName ?? '').split(' ')[0]);

  // ── KPI ────────────────────────────────────────────────────────────────────

  readonly kpiTiles = computed<KpiTile[]>(() => {
    // Les `label` sont des clés, traduites par le gabarit — mais les `delta` passent par
    // `translate.instant()` ici même. Sans cette lecture, le calcul ne dépend d'aucun
    // signal de langue et le décompte de factures reste figé dans la langue du premier
    // rendu quand l'utilisateur bascule.
    this.translate.currentLang();
    const s      = this.stats();
    const devise = s?.devise ?? this.currencyContext.defaultCurrency() ?? 'EUR';
    const money  = (v: number | null | undefined) => this.currency.transform(v ?? null, devise);

    return [
      {
        label: 'HOME.KPI.COLLECTED_TITLE',
        value: money(s?.encaisseThisMoisMontant),
        delta: null,
        options: { icon: 'trending_up', iconColor: 'text-success', iconBg: 'bg-success/10' },
      },
      {
        label: 'HOME.KPI.PENDING_TITLE',
        value: money(s?.enAttenteMontant),
        delta: null,
        options: { icon: 'schedule', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
      {
        label: 'HOME.KPI.OVERDUE_TITLE',
        value: money(s?.enRetardMontant),
        // Le nombre de factures en retard passe par `delta` : daf-metric-card n'a pas de
        // second slot, et c'est bien une précision sur le chiffre principal.
        delta: s && s.enRetardCount > 0
          ? { value: this.translate.instant('HOME.KPI.OVERDUE_COUNT', { count: s.enRetardCount }),
              direction: 'down' }
          : null,
        options: { icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10',
                   valueColor: 'text-danger' },
      },
      {
        // Le « délai moyen (DSO) » occupait cette case. Il ne se calculait que sur les
        // factures soldées des six derniers mois : les créances en retard jamais encaissées
        // n'entraient pas dans la moyenne, qui s'améliorait donc à mesure que l'arriéré
        // vieillissait. `delaiMoyenPaiement` a disparu de `PaymentsDashboardStats` ; la
        // case revient à la tranche la plus ancienne de la balance âgée, la même que sur
        // /finance/recouvrement, pour que les deux écrans racontent la même chose.
        label: 'HOME.KPI.PLUS_90_TITLE',
        value: money(s?.plus90Montant),
        delta: s && s.plus90Count > 0
          ? { value: this.translate.instant('HOME.KPI.PLUS_90_COUNT', { count: s.plus90Count }) }
          : null,
        options: (s?.plus90Count ?? 0) > 0
          ? { icon: 'hourglass_bottom', iconColor: 'text-danger', iconBg: 'bg-danger/10',
              valueColor: 'text-danger', deltaColor: 'text-danger' }
          : { icon: 'hourglass_bottom', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' },
      },
    ];
  });

  // ── Cartes de modules ──────────────────────────────────────────────────────

  /**
   * Construites depuis `HOME_MODULES`, la même liste que la barre latérale. Les
   * sous-entrées ne sont pas dépliées ici : l'accueil montre les modules de premier
   * niveau, la barre porte la navigation fine.
   *
   * `translate.currentLang()` est lu pour que titres et descriptions se retraduisent au
   * changement de langue — `daf-card` prend un objet d'options, pas un template, donc le
   * pipe n'est pas une option.
   */
  readonly moduleCards = computed<ModuleCard[]>(() => {
    this.translate.currentLang();

    return HOME_MODULES.map(m => ({
      id:    m.id,
      route: m.route,
      flex:  SPAN_FLEX[m.homeSpan ?? 1],
      options: {
        variant:    'glass',
        padding:    'md',
        radius:     'xl',
        hoverable:  true,
        clickable:  true,
        fullHeight: true,
        icon:       m.icon,
        iconFilled: true,
        ...TONE_ICON[m.tone],
        title:       this.translate.instant(m.labelKey),
        description: m.descKey ? this.translate.instant(m.descKey) : undefined,
      } satisfies CardOptions,
    }));
  });

  // ── Drawer d'activité ──────────────────────────────────────────────────────

  readonly activityDrawerConfig = computed<DrawerConfig>(() => {
    this.translate.currentLang();
    return {
      title:      this.translate.instant('HOME.ACTIVITY.TITLE'),
      icon:       'history',
      side:       'right',
      width:      '420px',
      closeLabel: this.translate.instant('HOME.ACTIVITY.TITLE'),
      // L'onglet de bord porte l'ouverture : l'activité n'est plus une section qui
      // occupe le bas de la page, mais elle reste à un clic.
      showToggle: true,
    };
  });

  ngOnInit(): void {
    this.affaireSvc.getPays().subscribe(list => this.paysList.set(list));
  }

  /** KPI, compteur « à valider » et activité récente, pour le pays du drapeau. */
  private load(paysId: number | null, paysList: string | null): void {
    const seq = ++this.loadSeq;
    const current = () => seq === this.loadSeq;
    this.loadingActivity.set(true);

    this.paymentSvc.getStats(paysId).subscribe({
      next:  s  => { if (!current()) return; this.stats.set(s); this.firstLoad.set(false); },
      error: () => { if (!current()) return; this.stats.set(null); this.firstLoad.set(false); },
    });

    this.invoiceSvc.getInvoices({ paysId: paysList, page: 0, size: 1, statut: 'SUBMITTED', from: null, to: null, search: null })
      .subscribe({
        next:  res => { if (current()) this.pendingCount.set(res.totalElements); },
        error: ()  => { if (current()) this.pendingCount.set(0); },
      });

    this.invoiceSvc.getInvoices({ paysId: paysList, page: 0, size: 6, statut: null, from: null, to: null, search: null })
      .subscribe({
        next: res => {
          if (!current()) return;
          this.recentActivity.set(res.content.map(inv => {
            const cfg = ACTIVITY_CONFIG[inv.statut] ?? { icon: 'receipt_long', tone: 'text-outline' };
            const statut = INVOICE_STATUT_CONFIG[inv.statut]?.label ?? inv.statut;
            return {
              icon:      cfg.icon,
              toneClass: cfg.tone,
              title:     this.translate.instant('HOME.ACTIVITY.INVOICE', {
                ref:    inv.invoiceNumber ?? this.translate.instant('HOME.ACTIVITY.DRAFT_REF'),
                client: inv.clientNom ?? '—',
              }),
              sub:       `${statut}${inv.dateEmission ? ' · ' + this.formatDate(inv.dateEmission) : ''}`,
              amount:    inv.montantTtc ? this.currency.transform(inv.montantTtc, inv.devise ?? this.currencyContext.defaultCurrency() ?? 'EUR') : null,
              invoice:   inv,
            } satisfies ActivityItem;
          }));
          this.loadingActivity.set(false);
        },
        error: () => { if (current()) this.loadingActivity.set(false); },
      });
  }

  navigateTo(path: string): void {
    this.router.navigate(['../', path], { relativeTo: this.activatedRoute });
  }

  openInvoice(id: number): void {
    this.activityDrawerOpen.set(false);
    this.router.navigate(['../', 'invoicing', id], { relativeTo: this.activatedRoute });
  }

  private formatDate(d: string): string {
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
