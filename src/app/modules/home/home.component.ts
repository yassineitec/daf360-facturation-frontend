import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, CardComponent, DrawerComponent, MetricCardComponent, PageComponent,
  PageHeaderComponent, SkeletonComponent, selectCurrentUser,
} from '@khalilrebhiitec/daf360';
import type {
  CardOptions, DrawerConfig, MetricCardOptions, MetricDelta,
} from '@khalilrebhiitec/daf360';
import { PaymentService } from '../payments/payment.service';
import { PaymentsDashboardStats } from '../payments/payment.model';
import { InvoiceService } from '../invoicing/invoice.service';
import { InvoiceListItem, INVOICE_STATUT_CONFIG } from '../invoicing/invoice.model';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { HOME_MODULES } from '../finance-modules';
import type { FinanceModuleDef } from '../finance-modules';

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
    DrawerComponent, SkeletonComponent, ButtonComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './home.component.html',
})
export class HomeComponent implements OnInit {
  private readonly paymentSvc     = inject(PaymentService);
  private readonly invoiceSvc     = inject(InvoiceService);
  private readonly router         = inject(Router);
  private readonly activatedRoute = inject(ActivatedRoute);
  private readonly ngrx           = inject(Store);
  private readonly translate      = inject(TranslateService);
  private readonly currency       = inject(DisplayCurrencyPipe);

  private readonly currentUser = toSignal(this.ngrx.select(selectCurrentUser));

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

  readonly firstName = computed(() => (this.currentUser()?.fullName ?? '').split(' ')[0]);

  // ── KPI ────────────────────────────────────────────────────────────────────

  readonly kpiTiles = computed<KpiTile[]>(() => {
    const s      = this.stats();
    const devise = s?.devise ?? 'TND';
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
        label: 'HOME.KPI.DSO_TITLE',
        value: s?.delaiMoyenPaiement != null ? `${s.delaiMoyenPaiement.toFixed(0)} j` : '—',
        delta: null,
        options: { icon: 'timer', iconColor: 'text-warning', iconBg: 'bg-warning/10' },
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
    this.paymentSvc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.firstLoad.set(false); },
      error: () => this.firstLoad.set(false),
    });

    this.invoiceSvc.getInvoices({ page: 0, size: 1, statut: 'SUBMITTED', from: null, to: null, search: null })
      .subscribe({
        next:  res => this.pendingCount.set(res.totalElements),
        error: ()  => this.pendingCount.set(0),
      });

    this.invoiceSvc.getInvoices({ page: 0, size: 6, statut: null, from: null, to: null, search: null })
      .subscribe({
        next: res => {
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
              amount:    inv.montantTtc ? this.currency.transform(inv.montantTtc, inv.devise ?? 'TND') : null,
              invoice:   inv,
            } satisfies ActivityItem;
          }));
          this.loadingActivity.set(false);
        },
        error: () => this.loadingActivity.set(false),
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
