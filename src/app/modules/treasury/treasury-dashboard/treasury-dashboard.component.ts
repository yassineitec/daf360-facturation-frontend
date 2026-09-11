import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BarChartComponent, ButtonComponent, DafCellDirective, DataTableComponent,
  MetricCardComponent, PageComponent, PageHeaderComponent, PaginationComponent,
  SectionCardComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BarChartBar, BarChartOptions, ButtonOptions, MetricCardOptions, MetricDelta,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { TreasuryService } from '../treasury.service';
import {
  TreasuryBucket, TreasuryFlow, TreasurySummary,
  TREASURY_HORIZONS, TreasuryHorizon,
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
 * ouvertes) et ce qui doit sortir (coûts engagés). Elle ne montre
 * **pas** un solde de trésorerie, parce qu'il n'y en a pas dans le modèle : aucun compte
 * bancaire, aucune position d'ouverture. La courbe cumulée part donc de zéro et se lit
 * « à partir d'aujourd'hui, la caisse varie de tant » — ce qui répond quand même à la
 * seule vraie question d'un prévisionnel : *quand est-ce que ça coince*. C'est le rôle du
 * point bas, mis en avant en tuile et surligné dans le tableau.
 *
 * Entrées et sorties ne sont jamais fondues en une seule colonne : une créance est
 * exigible, un engagement de dépense n'est réputé payé que si quelqu'un a saisi le
 * règlement. Les additionner sans le dire donnerait un chiffre lisse et faux.
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
    DataTableComponent, DafCellDirective, PaginationComponent,
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
   * prévisionnel serait un contrôle qui ne fait rien. L'horizon vit donc dans
   * `[pageActions]`, qui est le seul emplacement d'action que laisse la page
   * canonique quand il n'y a pas de barre d'outils (UI-PLAYBOOK §1).
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

  /**
   * Les quatre tuiles, chacune avec son `help`.
   *
   * `daf-metric-card` révèle le panneau au survol de **toute** la tuile, sans glyphe ni
   * bouton (§ `MetricCardOptions.help`) : l'écran ne gagne donc aucun `(i)`. C'est ce qui
   * permet d'en mettre sur les quatre sans transformer la ligne d'indicateurs en sapin de
   * Noël. Le texte y est une *annotation* — rien d'indispensable ne doit y vivre, un
   * appareil tactile ne le lira pas.
   */
  readonly kpiTiles = computed<KpiTile[]>(() => {
    const s = this.summary();
    if (!s) return [];
    this.translate.currentLang();
    const money = (v: number) => this.currency.transform(v, s.devise);
    const t = (k: string, p?: object) => this.translate.instant(k, p);

    return [
      {
        // Le plus urgent en premier : ce qui est déjà exigible et pas encaissé.
        label: 'TREASURY.KPI.OVERDUE_IN',
        value: money(s.creancesEchues),
        delta: { value: t('TREASURY.KPI.OVERDUE_OUT_DELTA', { amount: money(s.engagementsEchus) }), direction: 'down' },
        options: {
          icon: 'error', iconColor: 'text-danger', iconBg: 'bg-danger/10',
          valueColor: 'text-danger', deltaColor: 'text-on-surface-variant',
          helpTitle: t('TREASURY.KPI.OVERDUE_IN'),
          help:      t('TREASURY.HELP.OVERDUE_IN', { n: s.lookbackJours }),
        },
      },
      {
        label: 'TREASURY.KPI.EXPECTED_IN',
        value: money(s.creancesAVenir),
        delta: { value: t('TREASURY.KPI.NET_DELTA', { amount: money(s.netHorizon) }), direction: s.netHorizon < 0 ? 'down' : 'up' },
        options: {
          icon: 'trending_up', iconColor: 'text-teal', iconBg: 'bg-teal/10',
          deltaColor: 'text-on-surface-variant',
          helpTitle: t('TREASURY.KPI.EXPECTED_IN'),
          help:      t('TREASURY.HELP.EXPECTED_IN'),
        },
      },
      {
        label: 'TREASURY.KPI.EXPECTED_OUT',
        value: money(s.engagementsAVenir),
        delta: { value: t('TREASURY.KPI.COLLECTED_DELTA', { amount: money(s.encaisseRecent) }), direction: 'neutral' },
        options: {
          icon: 'trending_down', iconColor: 'text-warning', iconBg: 'bg-warning/10',
          deltaColor: 'text-on-surface-variant',
          helpTitle: t('TREASURY.KPI.EXPECTED_OUT'),
          help:      t('TREASURY.HELP.EXPECTED_OUT'),
        },
      },
      {
        // La tuile qui justifie la page : le creux, et quand il tombe.
        label: 'TREASURY.KPI.LOW_POINT',
        value: money(s.pointBasCumule),
        delta: s.pointBasPeriode
          ? { value: this.periodLabel(s.pointBasPeriode), direction: s.pointBasCumule < 0 ? 'down' : 'up' }
          : null,
        // `monitoring` (une courbe avec son creux) et non `savings`, dont le glyphe est
        // une tirelire : la tuile ne parle pas d'épargne mais du point le plus bas d'une
        // projection. Ni `trending_down`, déjà porté par la tuile des décaissements, ni
        // `south`, qui marque déjà la ligne du creux dans le tableau — trois endroits
        // avec la même flèche ne distinguent plus rien.
        //
        // `helpPlacement: 'top'` sur cette seule tuile : elle est la dernière de la
        // ligne et le panneau par défaut s'ouvre vers le bas, par-dessus les graphiques.
        options: s.pointBasCumule < 0
          ? {
              icon: 'warning', iconColor: 'text-danger', iconBg: 'bg-danger/10',
              valueColor: 'text-danger', deltaColor: 'text-danger',
              helpTitle: t('TREASURY.KPI.LOW_POINT'), help: t('TREASURY.HELP.LOW_POINT'),
            }
          : {
              icon: 'monitoring', iconColor: 'text-primary', iconBg: 'bg-primary/10',
              deltaColor: 'text-on-surface-variant',
              helpTitle: t('TREASURY.KPI.LOW_POINT'), help: t('TREASURY.HELP.LOW_POINT'),
            },
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
    const values = this.monthlyBuckets().flatMap(b => [b.encaissements, b.decaissements]);
    return Math.max(1, ...values);
  });

  readonly inflowBars = computed<BarChartBar[]>(() =>
    this.monthlyBuckets().map((b, i) => ({
      label:      this.shortPeriodLabel(b.periodKey),
      value:      b.encaissements,
      valueLabel: this.currency.transform(b.encaissements, this.devise()),
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
    // Plus de colonne « Jalons » : elle affichait « — » sur toutes les lignes depuis
    // toujours, faute d'échéancier dans le modèle (V46). Une colonne vide en permanence
    // se lit comme une panne de la page.
    // `align: 'right'` sur les quatre colonnes de montants, y compris les deux `custom`.
    // La lib ne centre ni n'aligne rien d'office : `align` non renseigné retombe sur
    // `text-left`, pour l'en-tête comme pour la cellule. Les gabarits projetés de `net`
    // et `cumul` forçaient déjà leur texte à droite de leur côté, donc l'en-tête restait
    // seul à gauche au-dessus de chiffres alignés à droite.
    return [
      { key: 'period', label: t('TREASURY.TABLE.PERIOD'), type: 'custom' },
      { key: 'in',     label: t('TREASURY.TABLE.IN'),     type: 'text',   align: 'right' },
      { key: 'out',    label: t('TREASURY.TABLE.OUT'),    type: 'text',   align: 'right' },
      { key: 'net',    label: t('TREASURY.TABLE.NET'),    type: 'custom', align: 'right' },
      { key: 'cumul',  label: t('TREASURY.TABLE.CUMUL'),  type: 'custom', align: 'right' },
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
      in:         b.encaissements ? money(b.encaissements) : '—',
      out:        b.decaissements ? money(b.decaissements) : '—',
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
      { key: 'amount', label: t('TREASURY.FLOWS.AMOUNT'),       type: 'custom', align: 'right' },
    ];
  });

  // ── Pagination ────────────────────────────────────────────────────────────
  //
  // Côté client : la page charge déjà tous les flux en un appel (c'est la raison d'être
  // de l'endpoint unique), donc paginer côté serveur voudrait dire redemander ce qu'on a
  // déjà. Le backend ne tronque plus à huit lignes — huit suffisaient à illustrer, pas à
  // vérifier un total ni à retrouver une facture.

  readonly inflowPage  = signal(0);
  readonly outflowPage = signal(0);
  readonly flowPageSize = signal(10);

  private readonly allInflows  = computed(() => this.summary()?.topEncaissements ?? []);
  private readonly allOutflows = computed(() => this.summary()?.topDecaissements ?? []);

  readonly inflowTotalPages  = computed(() => this.pageCount(this.allInflows().length));
  readonly outflowTotalPages = computed(() => this.pageCount(this.allOutflows().length));
  readonly inflowTotal  = computed(() => this.allInflows().length);
  readonly outflowTotal = computed(() => this.allOutflows().length);

  readonly inflowRows  = computed<TableRow[]>(() =>
    this.toFlowRows(this.slice(this.allInflows(), this.inflowPage())));

  readonly outflowRows = computed<TableRow[]>(() =>
    this.toFlowRows(this.slice(this.allOutflows(), this.outflowPage())));

  private pageCount(total: number): number {
    return Math.max(1, Math.ceil(total / this.flowPageSize()));
  }

  private slice(flows: TreasuryFlow[], page: number): TreasuryFlow[] {
    const size = this.flowPageSize();
    return flows.slice(page * size, page * size + size);
  }

  goToInflowPage(p: number):  void { this.inflowPage.set(p); }
  goToOutflowPage(p: number): void { this.outflowPage.set(p); }

  /**
   * `daf-pagination` n'émet jamais `pageChange` en même temps que `pageSizeChange`
   * (UI-PLAYBOOK §7) : c'est à la page de revenir en tête, sinon on reste sur une page
   * qui n'existe plus après agrandissement.
   */
  onFlowPageSize(size: number): void {
    this.flowPageSize.set(size);
    this.inflowPage.set(0);
    this.outflowPage.set(0);
  }

  private toFlowRows(flows: TreasuryFlow[]): TableRow[] {
    const s = this.summary();
    if (!s) return [];
    this.translate.currentLang();
    return flows.map(f => ({
      id:        `${f.source}-${f.id}`,
      _tiers:    f.tiers || '—',
      _label:    f.libelle || f.reference || '—',
      _due:      this.formatDate(f.dateEcheance),
      _late:     f.joursRetard,
      amount:    this.currency.transform(f.montant, f.devise || s.devise),
      // Le montant d'origine n'est montré que s'il a réellement été converti — sinon
      // chaque ligne répéterait sa propre valeur sous elle-même.
      _origin:   this.originLabel(f),
      _source:   f.source,
      _id:       f.id,
    }));
  }

  /** `"12 000,00 TND"` quand la ligne a été convertie, `null` quand elle était déjà en EUR. */
  private originLabel(f: TreasuryFlow): string | null {
    if (!f.deviseOrigine || !f.montantOrigine) return null;
    if (f.deviseOrigine === (f.devise ?? 'EUR')) return null;
    return `${f.montantOrigine.toLocaleString(this.locale(), { maximumFractionDigits: 3 })} ${f.deviseOrigine}`;
  }

  readonly inflowFlowConfig = computed<TableConfig>(() =>
    this.flowConfig('TREASURY.FLOWS.TOP_IN', 'TREASURY.FLOWS.EMPTY_IN'));

  readonly outflowFlowConfig = computed<TableConfig>(() =>
    this.flowConfig('TREASURY.FLOWS.TOP_OUT', 'TREASURY.FLOWS.EMPTY_OUT'));

  /**
   * `showHeader: true` **avec** un `title` — l'exception à UI-PLAYBOOK §6b règle 2, qui
   * proscrit la barre de titre de la table parce qu'elle se rend vide (`title ?? ''`)
   * au-dessus des lignes. Ici les deux tables sont côte à côte et doivent se distinguer ;
   * la barre porte donc un vrai libellé, et le `<h3>` qu'elle rend ne dispute pas son
   * `h1` au `daf-page-header`. C'est ce qui a permis de supprimer le `daf-section-card`
   * qui doublait la bordure de la table (§6b règle 1).
   *
   * `skeletonRows` suit la taille de page : le squelette a exactement la hauteur du
   * tableau qu'il remplace, donc un changement d'horizon ne fait pas sauter la page.
   */
  private flowConfig(titleKey: string, emptyKey: string): TableConfig {
    this.translate.currentLang();
    return {
      title:        this.translate.instant(titleKey),
      showHeader:   true,
      hoverable:    true,
      loading:      this.reloading(),
      skeletonRows: this.flowPageSize(),
      emptyMessage: this.translate.instant(emptyKey),
    };
  }

  /** Seules les factures ont une fiche à ouvrir — une ligne de coût n'en a pas ici. */
  onFlowClick(row: TableRow): void {
    if (row['_source'] !== 'INVOICE') return;
    this.router.navigate(['../recouvrement', row['_id']], { relativeTo: this.route });
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
