import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BarChartComponent, ButtonComponent, DafCellDirective, DataTableComponent,
  MetricCardComponent, PageComponent, PageHeaderComponent, SectionCardComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BarChartBar, BarChartOptions, ButtonOptions, MetricCardOptions, MetricDelta,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { TreasuryService } from '../treasury.service';
import {
  TreasuryBucket, TreasuryFlow, TreasurySummary, TREASURY_HORIZONS, TreasuryHorizon,
} from '../treasury.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

interface KpiTile {
  label:   string;
  value:   string;
  delta:   MetricDelta | null;
  options: MetricCardOptions;
}

/**
 * Trésorerie prévisionnelle — `/finance/tresorerie`.
 *
 * <h2>Ce que la page dit, et ce qu'elle se refuse à dire</h2>
 * Elle projette les **flux** attendus mois par mois : ce qui doit rentrer (factures
 * ouvertes, jalons planifiés) et ce qui doit sortir (coûts engagés). Elle ne montre
 * **pas** un solde de trésorerie, parce qu'il n'y en a pas dans le modèle : aucun compte
 * bancaire, aucune position d'ouverture. La courbe cumulée part donc de zéro et se lit
 * « à partir d'aujourd'hui, la caisse varie de tant » — ce qui répond quand même à la
 * seule vraie question d'un prévisionnel : *quand est-ce que ça coince*. C'est le rôle du
 * point bas, mis en avant en tuile et surligné dans le tableau.
 *
 * Les trois natures de flux ne sont jamais fondues en une seule colonne : une créance est
 * exigible, un jalon est un planning, un engagement de dépense n'a même pas d'indicateur
 * de règlement en base. Les additionner sans le dire donnerait un chiffre lisse et faux.
 *
 * <h2>Deux graphiques plutôt qu'un</h2>
 * `daf-bar-chart` est mono-série, et surtout il ne sait pas dessiner de valeur négative
 * (`barPct` diviserait un négatif par l'échelle). Entrées et sorties sont donc deux
 * graphiques, **partageant le même `max`** pour rester comparables à l'œil, et le net —
 * qui, lui, est signé — vit dans le tableau, où une couleur le porte sans ambiguïté.
 */
@Component({
  selector: 'app-treasury-dashboard',
  imports: [
    TranslatePipe, DisplayCurrencyPipe,
    PageComponent, PageHeaderComponent, SectionCardComponent,
    MetricCardComponent, ButtonComponent, BarChartComponent,
    DataTableComponent, DafCellDirective,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './treasury-dashboard.component.html',
})
export class TreasuryDashboardComponent implements OnInit {
  private readonly svc       = inject(TreasuryService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);

  summary   = signal<TreasurySummary | null>(null);
  firstLoad = signal(true);
  reloading = signal(false);
  error     = signal<string | null>(null);

  horizon = signal<TreasuryHorizon>(6);

  readonly horizons = TREASURY_HORIZONS;

  // ═══ Horizon ══════════════════════════════════════════════════════════════

  /**
   * Trois boutons `toggle` plutôt qu'un `daf-search-toolbar` : il n'y a rien à
   * rechercher ni à filtrer ici, et une barre de recherche vide au-dessus d'un
   * prévisionnel serait un contrôle qui ne fait rien (UI-PLAYBOOK §10b).
   */
  horizonOptions(months: TreasuryHorizon): ButtonOptions {
    this.translate.currentLang();
    return {
      variant: 'toggle',
      size:    'sm',
      active:  this.horizon() === months,
      label:   this.translate.instant('TREASURY.HORIZON.MONTHS', { n: months }),
    };
  }

  setHorizon(months: TreasuryHorizon): void {
    if (this.horizon() === months) return;
    this.horizon.set(months);
    this.load();
  }

  // ═══ Indicateurs ══════════════════════════════════════════════════════════

  readonly devise = computed(() => this.summary()?.devise ?? '');

  readonly kpiTiles = computed<KpiTile[]>(() => {
    const s = this.summary();
    if (!s) return [];
    this.translate.currentLang();
    const money = (v: number) => this.currency.transform(v, s.devise);

    return [
      {
        // Le plus urgent en premier : ce qui est déjà exigible et pas encaissé.
        label: 'TREASURY.KPI.OVERDUE_IN',
        value: money(s.creancesEchues),
        delta: { value: this.translate.instant('TREASURY.KPI.OVERDUE_OUT_DELTA', { amount: money(s.engagementsEchus) }), direction: 'down' },
        options: {
          icon: 'error', iconColor: 'text-danger', iconBg: 'bg-danger/10',
          valueColor: 'text-danger', deltaColor: 'text-on-surface-variant',
        },
      },
      {
        label: 'TREASURY.KPI.EXPECTED_IN',
        value: money(s.creancesAVenir + s.jalonsPrevus),
        delta: { value: this.translate.instant('TREASURY.KPI.OF_WHICH_MILESTONES', { amount: money(s.jalonsPrevus) }), direction: 'up' },
        options: {
          icon: 'trending_up', iconColor: 'text-teal', iconBg: 'bg-teal/10',
          deltaColor: 'text-on-surface-variant',
        },
      },
      {
        label: 'TREASURY.KPI.EXPECTED_OUT',
        value: money(s.engagementsAVenir),
        delta: null,
        options: { icon: 'trending_down', iconColor: 'text-warning', iconBg: 'bg-warning/10' },
      },
      {
        // La tuile qui justifie la page : le creux, et quand il tombe.
        label: 'TREASURY.KPI.LOW_POINT',
        value: money(s.pointBasCumule),
        delta: s.pointBasPeriode
          ? { value: this.periodLabel(s.pointBasPeriode), direction: s.pointBasCumule < 0 ? 'down' : 'up' }
          : null,
        options: s.pointBasCumule < 0
          ? { icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger', deltaColor: 'text-danger' }
          : { icon: 'savings', iconColor: 'text-primary', iconBg: 'bg-primary/10', deltaColor: 'text-on-surface-variant' },
      },
    ];
  });

  // ═══ Graphiques ═══════════════════════════════════════════════════════════

  /** Seaux mensuels seuls : le seau « échu » n'a pas de place sur un axe de temps. */
  private readonly monthlyBuckets = computed<TreasuryBucket[]>(() =>
    (this.summary()?.buckets ?? []).filter(b => !b.overdue));

  /**
   * Échelle commune aux deux graphiques. Sans elle, un mois à 12 k€ de sorties et un
   * mois à 300 k€ d'entrées dessineraient deux barres de même hauteur.
   */
  private readonly chartMax = computed(() => {
    const values = this.monthlyBuckets().flatMap(b => [b.encaissementsTotal, b.decaissements]);
    return Math.max(1, ...values);
  });

  readonly inflowBars = computed<BarChartBar[]>(() =>
    this.monthlyBuckets().map((b, i) => ({
      label:      this.shortPeriodLabel(b.periodKey),
      value:      b.encaissementsTotal,
      valueLabel: this.currency.transform(b.encaissementsTotal, this.devise()),
      highlight:  i === 0,
    })));

  readonly outflowBars = computed<BarChartBar[]>(() =>
    this.monthlyBuckets().map((b, i) => ({
      label:      this.shortPeriodLabel(b.periodKey),
      value:      b.decaissements,
      valueLabel: this.currency.transform(b.decaissements, this.devise()),
      highlight:  i === 0,
    })));

  readonly inflowChartOptions = computed<BarChartOptions>(() => {
    this.translate.currentLang();
    return {
      variant:      'teal',
      height:       '180px',
      max:          this.chartMax(),
      emptyMessage: this.translate.instant('TREASURY.CHART.EMPTY'),
      ariaLabel:    this.translate.instant('TREASURY.CHART.IN_ARIA'),
    };
  });

  readonly outflowChartOptions = computed<BarChartOptions>(() => {
    this.translate.currentLang();
    return {
      variant:      'warning',
      height:       '180px',
      max:          this.chartMax(),
      emptyMessage: this.translate.instant('TREASURY.CHART.EMPTY'),
      ariaLabel:    this.translate.instant('TREASURY.CHART.OUT_ARIA'),
    };
  });

  // ═══ Tableau de projection ════════════════════════════════════════════════

  readonly bucketColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'period',    label: t('TREASURY.TABLE.PERIOD'),    type: 'custom' },
      { key: 'invoices',  label: t('TREASURY.TABLE.INVOICES'),  type: 'text', align: 'right' },
      { key: 'milestones', label: t('TREASURY.TABLE.MILESTONES'), type: 'text', align: 'right' },
      { key: 'out',       label: t('TREASURY.TABLE.OUT'),       type: 'text', align: 'right' },
      { key: 'net',       label: t('TREASURY.TABLE.NET'),       type: 'custom' },
      { key: 'cumul',     label: t('TREASURY.TABLE.CUMUL'),     type: 'custom' },
    ];
  });

  readonly bucketRows = computed<TableRow[]>(() => {
    const s = this.summary();
    if (!s) return [];
    this.translate.currentLang();
    const money = (v: number) => this.currency.transform(v, s.devise);

    return s.buckets.map(b => ({
      id:         b.periodKey,
      // Rendus par les gabarits projetés : la période porte un marqueur « échu », et le
      // net comme le cumulé sont signés — une valeur négative doit se voir.
      _period:    b.overdue ? this.translate.instant('TREASURY.TABLE.OVERDUE_ROW') : this.periodLabel(b.periodKey),
      _overdue:   b.overdue,
      _lowPoint:  b.periodKey === s.pointBasPeriode,
      invoices:   b.encaissementsFactures ? money(b.encaissementsFactures) : '—',
      milestones: b.encaissementsJalons   ? money(b.encaissementsJalons)   : '—',
      out:        b.decaissements         ? money(b.decaissements)         : '—',
      _net:       money(b.net),
      _netSign:   Math.sign(b.net),
      _cumul:     money(b.cumule),
      _cumulSign: Math.sign(b.cumule),
    }));
  });

  readonly bucketConfig = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    false,
      loading:      this.reloading(),
      skeletonRows: this.horizon() + 1,
      emptyMessage: this.translate.instant('TREASURY.TABLE.EMPTY'),
    };
  });

  // ═══ Principaux flux ══════════════════════════════════════════════════════

  readonly flowColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'tiers',  label: t('TREASURY.FLOWS.COUNTERPARTY'), type: 'custom' },
      { key: 'due',    label: t('TREASURY.FLOWS.DUE'),          type: 'custom' },
      { key: 'amount', label: t('TREASURY.FLOWS.AMOUNT'),       type: 'text', align: 'right' },
    ];
  });

  readonly inflowRows  = computed<TableRow[]>(() => this.toFlowRows(this.summary()?.topEncaissements ?? []));
  readonly outflowRows = computed<TableRow[]>(() => this.toFlowRows(this.summary()?.topDecaissements ?? []));

  private toFlowRows(flows: TreasuryFlow[]): TableRow[] {
    const s = this.summary();
    if (!s) return [];
    this.translate.currentLang();
    return flows.map(f => ({
      id:        `${f.source}-${f.id}`,
      _tiers:    f.tiers || '—',
      _label:    f.libelle || f.reference || '—',
      // Un jalon n'est pas une créance : la ligne le dit, sinon les deux se lisent pareil.
      _forecast: f.source === 'MILESTONE',
      _due:      this.formatDate(f.dateEcheance),
      _late:     f.joursRetard,
      amount:    this.currency.transform(f.montant, f.devise || s.devise),
      _source:   f.source,
      _id:       f.id,
    }));
  }

  readonly inflowFlowConfig = computed<TableConfig>(() => this.flowConfig('TREASURY.FLOWS.EMPTY_IN'));
  readonly outflowFlowConfig = computed<TableConfig>(() => this.flowConfig('TREASURY.FLOWS.EMPTY_OUT'));

  private flowConfig(emptyKey: string): TableConfig {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      false,
      emptyMessage: this.translate.instant(emptyKey),
    };
  }

  /** Seules les factures ont une fiche à ouvrir — un jalon et un coût n'en ont pas ici. */
  onFlowClick(row: TableRow): void {
    if (row['_source'] !== 'INVOICE') return;
    this.router.navigate(['../payments', row['_id']], { relativeTo: this.route });
  }

  // ═══ Chargement ═══════════════════════════════════════════════════════════

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.reloading.set(true);
    this.error.set(null);
    this.svc.getSummary(this.horizon()).subscribe({
      next: s => {
        this.summary.set(s);
        this.reloading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('TREASURY.ERROR_LOAD'));
        this.reloading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  // ═══ Libellés ═════════════════════════════════════════════════════════════

  /** `"2026-08"` → `"août 2026"`. */
  periodLabel(periodKey: string): string {
    const [year, month] = periodKey.split('-').map(Number);
    if (!year || !month) return periodKey;
    return new Date(year, month - 1, 1)
      .toLocaleDateString(this.locale(), { month: 'long', year: 'numeric' });
  }

  /** `"2026-08"` → `"août"` — l'axe d'un graphique n'a pas la place pour l'année. */
  shortPeriodLabel(periodKey: string): string {
    const [year, month] = periodKey.split('-').map(Number);
    if (!year || !month) return periodKey;
    return new Date(year, month - 1, 1).toLocaleDateString(this.locale(), { month: 'short' });
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString(this.locale(), { day: '2-digit', month: 'short', year: 'numeric' });
  }

  private locale(): string {
    return this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
  }
}
