import { Component, DestroyRef, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, BadgeOptions, DafCellDirective, DataTableComponent,
  FilterField, FilterResult, FormFieldComponent, MetricCardComponent, MetricCardOptions, MetricDelta,
  ModalRef, ModalService, PageComponent, PageHeaderComponent, SearchToolbarComponent,
  SearchToolbarFilterConfig, SelectComponent, SelectOption,
  TableColumn, TableConfig, TableRow, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { PlPeriodCardsSectionComponent } from './pl-period-cards-section.component';
import { PlActionsMenuComponent, PlActionsMenuItem } from './pl-actions-menu.component';
import { ClientService } from '../clients/client.service';
import { AffaireService } from '../affaires/affaire.service';
import { PaysRefDto, paysLabel } from '../affaires/affaire.model';
import { PaysFlagSelectComponent, PaysFlagOption } from '../../shared/pays-flag-select/pays-flag-select.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { flagDataUri } from '../../shared/country-flags';
import { tableTools } from '../../shared/table-tools';
import { UserStore } from '../../core/user.store';
import { CurrencyContextService } from '../../core/currency-context.service';
import { PlPeriodService } from './pl-period.service';
import { PlReportService } from './pl-report.service';
import { PlPeriodDto, PlPeriodStatus, PlReportDto, PlReportStatus } from './pl-reporting.model';

/** `daf-badge` variant per `PlPeriod.status`. */
const PERIOD_STATUS_VARIANT: Record<PlPeriodStatus, NonNullable<BadgeOptions['variant']>> = {
  OPEN:      'info',
  CLOSED:    'warning',
  SUBMITTED: 'primary',
  APPROVED:  'success',
};

/** `daf-badge` variant per `PlReport.status`. */
const REPORT_STATUS_VARIANT: Record<PlReportStatus, NonNullable<BadgeOptions['variant']>> = {
  DRAFT:                'neutral',
  SUBMITTED:            'info',
  CD_ENDORSED:          'primary',
  GROUP_ACCEPTED:       'success',
  AMENDMENT_REQUESTED:  'warning',
  SUPERSEDED:           'neutral',
};

/** Report statuses still waiting on someone in the F.08 workflow — the "à traiter" KPI. */
const PENDING_REPORT_STATUSES: PlReportStatus[] = ['SUBMITTED', 'CD_ENDORSED', 'AMENDMENT_REQUESTED'];

/** Filter value for "period without any report" in the report-status filter. */
const NO_REPORT_FILTER = 'NONE';

/** Lifecycle order of a period — the Statut column sorts on it. */
const PERIOD_STATUS_ORDER: PlPeriodStatus[] = ['OPEN', 'CLOSED', 'SUBMITTED', 'APPROVED'];

/**
 * P&L Reporting (F.08) — period/report list.
 *
 * One row per `PlPeriod` for the selected pays, joined against its current `PlReport` (if
 * any — a period can be CLOSED with no report yet). Generating a report
 * (`POST /from-period/{periodId}`) only makes sense once a period is CLOSED and only for
 * someone holding `FACT_MANAGE_PL_REPORT`; clicking a row that already has a report opens
 * its detail screen (Task 3.2).
 */
import { PageGuideComponent } from '../../shared/guide/page-guide.component';
import type { GuideStep } from '../../shared/guide/page-guide.types';

/** Guide de la page — `target` = un `data-guide` du gabarit. */
const step = (key: string, icon: string, target?: string, tab?: string): GuideStep => ({
  icon, titleKey: `GUIDE.REPORTING.${key}_TITLE`, textKey: `GUIDE.REPORTING.${key}_TEXT`, target, tab,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO', 'monitoring'),
  step('ACTIONS', 'more_horiz', 'reporting-actions'),
  step('KPIS', 'insights', 'reporting-kpis'),
  step('TOOLBAR', 'search', 'reporting-toolbar'),
  step('LIST', 'calendar_view_month', 'reporting-list'),
  step('LIFECYCLE', 'route', 'reporting-list'),
  step('END', 'help'),
];

@Component({
  selector: 'app-reporting-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent,
    DataTableComponent, DafCellDirective, PaysFlagSelectComponent,
    FormFieldComponent, SelectComponent, MetricCardComponent, SearchToolbarComponent,
    PlPeriodCardsSectionComponent, PlActionsMenuComponent,
    PageGuideComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './reporting-list.component.html',
})
export class ReportingListComponent implements OnInit {

  readonly guideSteps = GUIDE_STEPS;
  private readonly periodSvc = inject(PlPeriodService);
  private readonly reportSvc = inject(PlReportService);
  private readonly clientSvc  = inject(ClientService);
  private readonly affaireSvc = inject(AffaireService);
  private readonly userStore = inject(UserStore);
  private readonly currencyContext = inject(CurrencyContextService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly translate = inject(TranslateService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modal     = inject(ModalService);

  // ── Pays selector — same pattern as admin-list.component.ts ────────────────
  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  /**
   * The 13 ARX entities with their real reporting currency (`pays_ref.devise` — "EUR" for
   * Tunisia, "USD" for Egypt, confirmed by the owner, NOT each country's own national
   * currency). `ClientService.getPays()`/`getPaysInUse()` (the 194-country reference list
   * `paysList` above is built from) never populates `devise` — only `GET /ref/pays/arx-
   * entities` does (see `PaysRefDto.devise`'s own doc comment) — so this is a second,
   * separate fetch, same one `admin-list.component.ts`'s Entity Currency tab already uses.
   */
  private readonly entities = signal<PaysRefDto[]>([]);

  /** Real per-pays reporting currency for whichever pays is selected — falls back to "EUR"
   *  (the group template's own default) only if the selected pays isn't an ARX entity yet,
   *  never to the previous hardcoded "TND". */
  readonly reportingCurrency = computed(() =>
    this.entities().find(e => e.id === this.paysId())?.devise ?? this.currencyContext.defaultCurrency() ?? 'EUR');

  readonly paysOptions = computed<PaysFlagOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      label: `${paysLabel(p, this.translate.currentLang())} (${p.isoCode})`,
      isoCode: p.isoCode,
    })));

  readonly paysSelectPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.PAYS.SEARCH');
  });

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0) this.selectPays(id);
  }

  // ── Data ─────────────────────────────────────────────────────────────────
  periods = signal<PlPeriodDto[]>([]);
  reports = signal<PlReportDto[]>([]);

  firstLoad = signal(true);
  loading   = signal(false);
  error     = signal<string | null>(null);

  /** Id of the period whose report is currently being generated — disables just that row's button. */
  generatingId = signal<number | null>(null);

  readonly canManage = computed(() => this.userStore.hasPermission('FACT_MANAGE_PL_REPORT'));

  /** Create/close a period is a COST action, not a report action — enforced server-side on
   *  `PlPeriodController` with `FACT_MANAGE_COST`, same permission as the rest of the cost-close
   *  workflow (see `PlPeriodService`'s own doc comments). Deliberately separate from
   *  `canManage` above: closing the cost period and drafting the P&L report are different
   *  responsibilities that can belong to different people. */
  readonly canManagePeriod = computed(() => this.userStore.hasPermission('FACT_MANAGE_COST'));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  ngOnInit(): void {
    this.firstLoad.set(true);
    forkJoin({
      myPays:    this.clientSvc.getMyPays(),
      allPays:   this.clientSvc.getPays(),
      paysInUse: this.clientSvc.getPaysInUse(),
      entities:  this.affaireSvc.getArxEntities(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ myPays, allPays, paysInUse, entities }) => {
        this.entities.set(entities);
        const inUseIds = new Set(paysInUse.map(p => p.id));
        const pays = [
          ...allPays.filter(p => inUseIds.has(p.id)),
          ...allPays.filter(p => !inUseIds.has(p.id)),
        ];
        this.paysList.set(pays);
        const resolved = myPays ?? (pays.length > 0 ? pays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.loadData();
        } else {
          this.firstLoad.set(false);
          this.error.set(this.translate.instant('REPORTING.ERROR_PAYS'));
        }
      },
      error: () => {
        this.firstLoad.set(false);
        this.error.set(this.translate.instant('REPORTING.ERROR_PAYS'));
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.loadData();
  }

  loadData(): void {
    const paysId = this.paysId();
    if (!paysId) return;
    this.loading.set(true);
    this.error.set(null);
    forkJoin({
      periods: this.periodSvc.getPeriods(paysId),
      reports: this.reportSvc.getReports(paysId),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ periods, reports }) => {
        this.periods.set(periods);
        this.reports.set(reports);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: () => {
        this.error.set(this.translate.instant('REPORTING.LOAD_ERROR'));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  // ── Table ────────────────────────────────────────────────────────────────
  /** The report that currently represents a period: the highest-version non-SUPERSEDED
   *  row for that `plPeriodId`, or (if every version was superseded, which should not
   *  happen in practice) the highest version overall. */
  private currentReportFor(periodId: number): PlReportDto | null {
    const matches = this.reports().filter(r => r.plPeriodId === periodId);
    if (!matches.length) return null;
    const active = matches.filter(r => r.status !== 'SUPERSEDED');
    const pool = active.length ? active : matches;
    return pool.reduce((a, b) => (b.version > a.version ? b : a));
  }

  private periodLabel(p: PlPeriodDto): string {
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    const label = new Date(p.periodYear, p.periodMonth - 1, 1)
      .toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  /**
   * The year the KPI row sums over: the one picked in the filter panel, otherwise the
   * latest year that has at least one period (the current year when there is none yet).
   * Only the year filter feeds the KPIs — status/search filters narrow the table, not the
   * totals, so the tiles stay a stable picture of the year.
   */
  readonly kpiYear = computed<number>(() => {
    const picked = Number(this.filterYear());
    if (picked > 0) return picked;
    const years = this.periods().map(p => p.periodYear);
    return years.length ? Math.max(...years) : this.currentYear;
  });

  /** Periods of `kpiYear` that are no longer OPEN — amounts are only snapshotted on close. */
  private readonly closedPeriodsOfYear = computed(() =>
    this.periods()
      .filter(p => p.periodYear === this.kpiYear() && p.status !== 'OPEN')
      .sort((a, b) => a.periodMonth - b.periodMonth));

  private readonly sum = (pick: (p: PlPeriodDto) => number | null | undefined) =>
    this.closedPeriodsOfYear().reduce((acc, p) => acc + (pick(p) ?? 0), 0);

  readonly kpiNetRevenue = computed(() => this.sum(p => p.netRevenueLocal));
  readonly kpiEbitda     = computed(() => this.sum(p => p.ebitda));

  /** Same base as the backend's per-period `ebitdaPct`: EBITDA / Gross Revenue 2. */
  readonly kpiMargin = computed<number | null>(() => {
    const gr2 = this.sum(p => p.grossRevenue2Local);
    return gr2 === 0 ? null : (this.kpiEbitda() / gr2) * 100;
  });

  /** Current reports still in the workflow, across every period of the selected pays. */
  private readonly pendingReports = computed(() =>
    this.periods()
      .map(p => this.currentReportFor(p.id))
      .filter((r): r is PlReportDto => r != null && PENDING_REPORT_STATUSES.includes(r.status)));

  readonly pendingReportsCount = computed(() => this.pendingReports().length);

  readonly kpiNetRevenueDisplay = computed(() =>
    this.closedPeriodsOfYear().length ? this.currency.transform(this.kpiNetRevenue(), this.reportingCurrency()) : '—');
  readonly kpiEbitdaDisplay = computed(() =>
    this.closedPeriodsOfYear().length ? this.currency.transform(this.kpiEbitda(), this.reportingCurrency()) : '—');
  readonly kpiMarginDisplay = computed(() => {
    const m = this.kpiMargin();
    return m == null ? '—' : `${m.toFixed(1)}%`;
  });

  readonly kpiNetRevenueLabel = computed(() => this.kpiLabel('NET_REVENUE'));
  readonly kpiEbitdaLabel     = computed(() => this.kpiLabel('EBITDA'));
  readonly kpiMarginLabel     = computed(() => this.kpiLabel('MARGIN'));
  readonly kpiPendingLabel    = computed(() => this.kpiLabel('PENDING'));

  private kpiLabel(kpi: string): string {
    this.translate.currentLang();
    return this.translate.instant(`REPORTING.KPI.${kpi}`, { year: this.kpiYear() });
  }

  readonly kpiNetRevenueOptions = computed<MetricCardOptions>(() => ({
    icon: 'trending_up', iconColor: 'text-primary', iconBg: 'bg-primary/10',
    deltaColor: 'text-on-surface-variant',
    ...this.help('NET_REVENUE'),
  }));

  readonly kpiEbitdaOptions = computed<MetricCardOptions>(() => ({
    icon: 'account_balance_wallet',
    ...(this.kpiEbitda() < 0
      ? { iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
      : { iconColor: 'text-teal', iconBg: 'bg-teal/10' }),
    ...this.help('EBITDA'),
  }));

  readonly kpiMarginOptions = computed<MetricCardOptions>(() => {
    const delta = this.marginVariation();
    return {
      icon: 'percent', iconColor: 'text-secondary', iconBg: 'bg-secondary/10',
      ...((this.kpiMargin() ?? 0) < 0 ? { valueColor: 'text-danger' } : {}),
      deltaColor: delta == null || delta === 0 ? 'text-on-surface-variant'
        : delta > 0 ? 'text-success' : 'text-danger',
      ...this.help('MARGIN'),
    };
  });

  readonly kpiPendingOptions = computed<MetricCardOptions>(() => ({
    icon: 'pending_actions',
    ...(this.pendingReports().length > 0
      ? { iconColor: 'text-warning', iconBg: 'bg-warning/10', valueColor: 'text-warning' }
      : { iconColor: 'text-secondary', iconBg: 'bg-secondary/10' }),
    deltaColor: 'text-on-surface-variant',
    ...this.help('PENDING'),
  }));

  private help(kpi: string): Pick<MetricCardOptions, 'help' | 'helpTitle'> {
    this.translate.currentLang();
    return {
      helpTitle: this.translate.instant(`REPORTING.KPI.${kpi}`, { year: this.kpiYear() }),
      help:      this.translate.instant(`REPORTING.KPI.${kpi}_HELP`),
    };
  }

  readonly kpiNetRevenueDelta = computed<MetricDelta | null>(() => {
    this.translate.currentLang();
    const n = this.closedPeriodsOfYear().length;
    return { value: this.translate.instant('REPORTING.KPI.CLOSED_COUNT', { n }) };
  });

  /** EBITDA % of the last closed month minus the one before it, in points. */
  private readonly marginVariation = computed<number | null>(() => {
    const closed = this.closedPeriodsOfYear().filter(p => p.ebitdaPct != null);
    if (closed.length < 2) return null;
    return closed[closed.length - 1].ebitdaPct! - closed[closed.length - 2].ebitdaPct!;
  });

  readonly kpiMarginDelta = computed<MetricDelta | null>(() => {
    const d = this.marginVariation();
    if (d == null) return null;
    this.translate.currentLang();
    const sign = d > 0 ? '+' : '';
    return {
      value: this.translate.instant('REPORTING.KPI.MARGIN_DELTA', { delta: `${sign}${d.toFixed(1)}` }),
      direction: d > 0 ? 'up' : d < 0 ? 'down' : 'neutral',
    };
  });

  readonly kpiPendingDelta = computed<MetricDelta | null>(() => {
    this.translate.currentLang();
    const count = (s: PlReportStatus) => this.pendingReports().filter(r => r.status === s).length;
    const parts = [
      { n: count('SUBMITTED'),           key: 'REPORTING.KPI.TO_ENDORSE' },
      { n: count('CD_ENDORSED'),         key: 'REPORTING.KPI.TO_ACCEPT' },
      { n: count('AMENDMENT_REQUESTED'), key: 'REPORTING.KPI.TO_AMEND' },
    ].filter(p => p.n > 0).map(p => this.translate.instant(p.key, { n: p.n }));
    return { value: parts.length ? parts.join(' · ') : this.translate.instant('REPORTING.KPI.NOTHING_PENDING') };
  });

  // ── Search & filters (client-side: the whole pays' periods are already loaded) ──
  searchText         = signal('');
  filterYear         = signal('');
  filterPeriodStatus = signal('');
  filterReportStatus = signal('');

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const years = [...new Set([...this.periods().map(p => p.periodYear), this.currentYear])]
      .sort((a, b) => b - a);
    const all = { value: '', label: t('REPORTING.FILTER.ALL') };
    return [
      { name: 'year', label: t('REPORTING.FILTER.YEAR'), type: 'select',
        options: [all, ...years.map(y => ({ value: String(y), label: String(y) }))] },
      { name: 'periodStatus', label: t('REPORTING.FILTER.PERIOD_STATUS'), type: 'select',
        options: [all, ...(Object.keys(PERIOD_STATUS_VARIANT) as PlPeriodStatus[])
          .map(s => ({ value: s, label: t(`REPORTING.PERIOD_STATUS.${s}`) }))] },
      { name: 'reportStatus', label: t('REPORTING.FILTER.REPORT_STATUS'), type: 'select',
        options: [all, { value: NO_REPORT_FILTER, label: t('REPORTING.NO_REPORT') },
          ...(Object.keys(REPORT_STATUS_VARIANT) as PlReportStatus[])
            .filter(s => s !== 'SUPERSEDED')
            .map(s => ({ value: s, label: t(`REPORTING.REPORT_STATUS.${s}`) }))] },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('REPORTING.FILTER.PANEL_TITLE'),
      applyLabel:   t('REPORTING.FILTER.APPLY'),
      cancelLabel:  t('REPORTING.NEW_PERIOD_CANCEL'),
      resetLabel:   t('REPORTING.FILTER.RESET'),
      triggerLabel: t('REPORTING.FILTER.FILTERS'),
      initialValues: {
        year:         this.filterYear(),
        periodStatus: this.filterPeriodStatus(),
        reportStatus: this.filterReportStatus(),
      },
    };
  });

  applyFilters(result: FilterResult): void {
    this.filterYear.set((result['year'] as string | null) ?? '');
    this.filterPeriodStatus.set((result['periodStatus'] as string | null) ?? '');
    this.filterReportStatus.set((result['reportStatus'] as string | null) ?? '');
  }

  resetFilters(): void {
    this.filterYear.set('');
    this.filterPeriodStatus.set('');
    this.filterReportStatus.set('');
  }

  private readonly filteredPeriods = computed(() => {
    const year   = Number(this.filterYear());
    const status = this.filterPeriodStatus();
    const report = this.filterReportStatus();
    const q      = this.searchText().trim().toLowerCase();
    this.translate.currentLang();
    return this.periods().filter(p => {
      if (year > 0 && p.periodYear !== year) return false;
      if (status && p.status !== status) return false;
      if (report) {
        const current = this.currentReportFor(p.id);
        if (report === NO_REPORT_FILTER ? current != null : current?.status !== report) return false;
      }
      return !q || this.periodLabel(p).toLowerCase().includes(q);
    });
  });

  // ── View mode (cards / table) — same toggle as the recouvrement dashboard ──
  viewMode = signal<'grid' | 'list'>('grid');

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('REPORTING.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('REPORTING.VIEW_LIST') },
    ];
  });

  /** Only rendered in list mode — the toolbar's column tools follow it (null in grid mode). */
  protected readonly plTable = viewChild(DataTableComponent);

  // ── Table ────────────────────────────────────────────────────────────────
  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'period',       label: t('REPORTING.TABLE.PERIOD'), type: 'text',   sortable: true,
        sortAccessor: (row: TableRow) => row['_periodSort'] as number },
      { key: 'periodStatus', label: t('REPORTING.TABLE.STATUS'), type: 'badge', sortable: true,
        sortAccessor: (row: TableRow) => row['_statusSort'] as number },
      { key: 'report',       label: t('REPORTING.TABLE.REPORT'), type: 'badge', sortable: true,
        sortAccessor: (row: TableRow) => row['_reportSort'] as string },
      { key: 'netRevenue',   label: t('REPORTING.TABLE.NET_REVENUE'), type: 'text', sortable: true, align: 'right',
        sortAccessor: (row: TableRow) => row['_netRevenueSort'] as number },
      { key: 'ebitda',       label: t('REPORTING.TABLE.EBITDA'), type: 'text',   sortable: true, align: 'right',
        sortAccessor: (row: TableRow) => row['_ebitdaSort'] as number },
      { key: 'ebitdaPct',    label: t('REPORTING.TABLE.EBITDA_PCT'), type: 'custom', sortable: true, align: 'right',
        sortAccessor: (row: TableRow) => row['_ebitdaPctSort'] as number },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return [...this.filteredPeriods()]
      .sort((a, b) => (b.periodYear - a.periodYear) || (b.periodMonth - a.periodMonth))
      .map(period => {
        const report = this.currentReportFor(period.id);
        // An OPEN period has no snapshot yet: its amounts are not figures, show a dash.
        const open = period.status === 'OPEN';
        const reportBadge: BadgeCell | null = report
          ? {
              label:   t(`REPORTING.REPORT_STATUS.${report.status}`),
              options: { variant: REPORT_STATUS_VARIANT[report.status] ?? 'neutral', dot: true, size: 'sm' },
            }
          : null;
        return {
          id:          period.id,
          period:       this.periodLabel(period),
          periodStatus: {
            label:   t(`REPORTING.PERIOD_STATUS.${period.status}`),
            options: { variant: PERIOD_STATUS_VARIANT[period.status] ?? 'neutral', dot: true, size: 'sm' },
          } satisfies BadgeCell,
          report: reportBadge ?? ({
            label:   t('REPORTING.NO_REPORT'),
            options: { variant: 'neutral', size: 'sm' },
          } satisfies BadgeCell),
          netRevenue: open ? '—' : this.currency.transform(period.netRevenueLocal, this.reportingCurrency()),
          ebitda:     open ? '—' : this.currency.transform(period.ebitda, this.reportingCurrency()),
          ebitdaPct:  open || period.ebitdaPct == null ? '—' : `${period.ebitdaPct.toFixed(1)}%`,

          // Sort keys (the displayed values are formatted strings) and the EBITDA % cell's colour.
          _periodSort:     period.periodYear * 100 + period.periodMonth,
          _statusSort:     PERIOD_STATUS_ORDER.indexOf(period.status),
          _reportSort:     report?.status ?? '',
          _netRevenueSort: open ? -Infinity : period.netRevenueLocal ?? 0,
          _ebitdaSort:     open ? -Infinity : period.ebitda ?? 0,
          _ebitdaPctSort:  open || period.ebitdaPct == null ? -Infinity : period.ebitdaPct,
          _ebitdaNegative: !open && (period.ebitdaPct ?? 0) < 0,

          // Read by the card view's subtitle.
          _reportBadge: reportBadge,
          _reportId:     report?.id ?? null,
          _canGenerate:  period.status === 'CLOSED' && !report && this.canManage(),
          _canClose:     period.status === 'OPEN' && this.canManagePeriod(),
          _period:       period,
        };
      });
  });

  /** Same table setup as the report detail's tables and the affaire page's TS tab:
   *  `tableTools` brings resizable columns and rows, the column picker, the reset button
   *  (next to "Filtres" in the toolbar) and a stable `rowId` (the period id). */
  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    const filtered = this.periods().length > 0 && this.filteredPeriods().length === 0;
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: 8,
      emptyMessage: this.translate.instant(filtered ? 'REPORTING.DETAIL.TOOLBAR.NO_MATCH' : 'REPORTING.EMPTY'),
      // "Clôturer" and "Générer le rapport" as built-in row actions at the end of the row
      // (they used to be full buttons inside the status / report cells). `hidden` keeps each
      // to the rows where it applies — `_canClose`: OPEN period + FACT_MANAGE_COST;
      // `_canGenerate`: CLOSED period without report + FACT_MANAGE_PL_REPORT — and the lib
      // draws and styles the buttons, no projected column needed.
      actions: [{
        id:       'close',
        icon:     'lock',
        tooltip:  this.translate.instant('REPORTING.CLOSE_PERIOD'),
        hidden:   row => !row['_canClose'],
        disabled: row => this.closingId() === row['id'],
        onClick:  row => this.openClosePeriod(row['_period'] as PlPeriodDto),
      }, {
        id:       'generate',
        icon:     'auto_awesome',
        tooltip:  this.translate.instant('REPORTING.GENERATE'),
        hidden:   row => !row['_canGenerate'],
        disabled: () => this.generatingId() != null,
        onClick:  row => this.onGenerate(row['_period'] as PlPeriodDto),
      }],
      ...tableTools(this.translate),
    };
  });

  onRowClick(row: TableRow): void {
    const reportId = row['_reportId'] as number | null;
    if (reportId != null) this.router.navigate([reportId], { relativeTo: this.route });
  }

  // ── Header "Actions" menu ─────────────────────────────────────────────────
  /** Unlike 'calendar'/'budget' (readable at the broad `FACT_VIEW_PL_REPORT` route guard,
   *  edit gated inside each component), every single `pl-catalogue` endpoint requires
   *  `FACT_ADMIN_PL_CATALOGUE` — showing this item to someone without it would only lead to
   *  a screen where every call 403s, so it's gated here instead. */
  readonly canAdminCatalogue = computed(() => this.userStore.hasPermission('FACT_ADMIN_PL_CATALOGUE'));

  readonly actionItems = computed<PlActionsMenuItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const canCreate = this.canManagePeriod();
    return [
      ...(canCreate ? [{ id: 'new-period', icon: 'add_chart', label: t('REPORTING.NEW_PERIOD') }] : []),
      { id: 'calendar', icon: 'calendar_month', label: t('REPORTING.CALENDAR.TITLE'), separatorBefore: canCreate },
      { id: 'budget',   icon: 'request_quote',  label: t('REPORTING.BUDGET.TITLE') },
      ...(this.canAdminCatalogue()
        ? [{ id: 'pl-catalogue', icon: 'rule', label: t('REPORTING.PL_CATALOGUE.TITLE') }]
        : []),
    ];
  });

  onActionItem(id: string): void {
    if (id === 'new-period') this.openCreatePeriod();
    else if (id === 'calendar') this.goToCalendar();
    else if (id === 'budget') this.goToBudget();
    else if (id === 'pl-catalogue') this.goToPlCatalogue();
  }

  goToBudget(): void {
    this.router.navigate(['budget'], { relativeTo: this.route });
  }

  goToCalendar(): void {
    this.router.navigate(['calendar'], { relativeTo: this.route });
  }

  goToPlCatalogue(): void {
    this.router.navigate(['pl-catalogue'], { relativeTo: this.route });
  }

  /** Projected button in the 'report' cell — stops the click from also firing `rowClick`.
   *  No event from the card view: `daf-entity-card` already stops its action clicks. */
  onGenerate(period: PlPeriodDto, event?: MouseEvent): void {
    event?.stopPropagation();
    if (this.generatingId() != null) return;
    this.generatingId.set(period.id);
    this.reportSvc.generateFromPeriod(period.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: report => {
        this.reports.update(list => [...list, report]);
        this.generatingId.set(null);
      },
      error: () => {
        this.generatingId.set(null);
        this.error.set(this.translate.instant('REPORTING.GENERATE_ERROR'));
      },
    });
  }

  // ── Create period ────────────────────────────────────────────────────────

  private readonly newPeriodTpl = viewChild.required<TemplateRef<unknown>>('newPeriodTpl');
  private newPeriodRef: ModalRef | null = null;

  private readonly currentYear  = new Date().getFullYear();
  private readonly currentMonth = new Date().getMonth() + 1;

  newPeriodYear  = signal<number>(this.currentYear);
  newPeriodMonth = signal<number>(this.currentMonth);
  /** Pre-filled with the page's country, changeable — the period need not be for it. */
  newPeriodPaysId = signal<number>(0);

  /** `daf-select` and not the page's `app-pays-flag-select`: that one drops its list in
   *  place, where the modal's scrolling body would clip it; `daf-select` portals its panel
   *  to <body>. The flags come along through `imageUrl`. */
  readonly newPeriodPaysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({
      value:    String(p.id),
      label:    `${paysLabel(p, this.translate.currentLang())} (${p.isoCode})`,
      imageUrl: flagDataUri(p.isoCode) || undefined,
    })));

  onNewPeriodPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0) this.newPeriodPaysId.set(id);
  }
  creatingPeriod = signal(false);
  createPeriodError = signal<string | null>(null);

  readonly newPeriodYearOptions = computed<SelectOption[]>(() =>
    [this.currentYear - 1, this.currentYear, this.currentYear + 1]
      .map(y => ({ value: String(y), label: String(y) })));

  readonly newPeriodMonthOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
      const label = new Date(2000, m - 1, 1).toLocaleDateString(locale, { month: 'long' });
      return { value: String(m), label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  });

  onNewPeriodYearSelected(values: string[]): void {
    const y = Number(values[0]);
    if (Number.isFinite(y)) this.newPeriodYear.set(y);
  }

  onNewPeriodMonthSelected(values: string[]): void {
    const m = Number(values[0]);
    if (Number.isFinite(m)) this.newPeriodMonth.set(m);
  }

  openCreatePeriod(): void {
    this.createPeriodError.set(null);
    this.newPeriodPaysId.set(this.paysId());
    this.newPeriodYear.set(this.currentYear);
    this.newPeriodMonth.set(this.currentMonth);
    const t = (k: string) => this.translate.instant(k);
    this.newPeriodRef = this.modal.open({
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
      title: t('REPORTING.NEW_PERIOD_TITLE'),
      icon:  'add_chart',
      body:  this.newPeriodTpl(),
      closeOnBackdrop: false,
      buttons: [
        { label: t('REPORTING.NEW_PERIOD_CANCEL'), variant: 'secondary', action: () => this.closeCreatePeriod() },
        { label: t('REPORTING.NEW_PERIOD_CREATE'), variant: 'primary', icon: 'add', action: () => this.submitCreatePeriod() },
      ],
    });
  }

  closeCreatePeriod(): void {
    this.newPeriodRef?.close();
    this.newPeriodRef = null;
  }

  submitCreatePeriod(): void {
    if (this.creatingPeriod()) return;
    this.creatingPeriod.set(true);
    this.createPeriodError.set(null);
    this.periodSvc.createPeriod({
      paysId:      this.newPeriodPaysId() || this.paysId(),
      periodYear:  this.newPeriodYear(),
      periodMonth: this.newPeriodMonth(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: period => {
        this.creatingPeriod.set(false);
        this.closeCreatePeriod();
        // Created for another country: switch the page to it so the new period shows
        // (selectPays reloads that country's periods and reports).
        if (period.paysId !== this.paysId()) this.selectPays(period.paysId);
        else this.periods.update(list => [...list, period]);
      },
      error: (err: unknown) => {
        this.creatingPeriod.set(false);
        const e = err as { error?: { detail?: string; message?: string } };
        this.createPeriodError.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('REPORTING.NEW_PERIOD_ERROR'));
      },
    });
  }

  // ── Close period ─────────────────────────────────────────────────────────

  private readonly closePeriodTpl = viewChild.required<TemplateRef<unknown>>('closePeriodTpl');
  private closePeriodRef: ModalRef | null = null;
  private periodBeingClosed: PlPeriodDto | null = null;

  closingId = signal<number | null>(null);
  closeIntercompanyInbound  = signal<number | null>(null);
  closeIntercompanyOutbound = signal<number | null>(null);
  closeIntersedeInbound     = signal<number | null>(null);
  closeIntersedeOutbound    = signal<number | null>(null);
  closeWipPreviousYears     = signal<number | null>(null);
  closeSalaryRecharges      = signal<number | null>(null);
  closeOtherCostRecharges   = signal<number | null>(null);
  /** P&L Complete follow-up (WP10 review item #1) -- Template row 4's "Average FTE", a
   *  separate backend endpoint from the close waterfall (`PUT .../average-fte`, not part of
   *  `ClosePeriodRequest`), set in the same modal for convenience since it's the same
   *  once-per-close workflow moment. */
  closeAverageFte           = signal<number | null>(null);

  /** Projected button in the 'periodStatus' cell — stops the click from also firing `rowClick`.
   *  No event from the card view (see `onGenerate`). */
  openClosePeriod(period: PlPeriodDto, event?: MouseEvent): void {
    event?.stopPropagation();
    this.periodBeingClosed = period;
    this.closeIntercompanyInbound.set(null);
    this.closeIntercompanyOutbound.set(null);
    this.closeIntersedeInbound.set(null);
    this.closeIntersedeOutbound.set(null);
    this.closeWipPreviousYears.set(null);
    this.closeSalaryRecharges.set(null);
    this.closeOtherCostRecharges.set(null);
    this.closeAverageFte.set(period.averageFte ?? null);
    const t = (k: string) => this.translate.instant(k);
    this.closePeriodRef = this.modal.open({
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
      title: t('REPORTING.CLOSE_PERIOD_TITLE'),
      icon:  'lock',
      body:  this.closePeriodTpl(),
      closeOnBackdrop: false,
      buttons: [
        { label: t('REPORTING.NEW_PERIOD_CANCEL'), variant: 'secondary', action: () => this.closeClosePeriodModal() },
        { label: t('REPORTING.CLOSE_PERIOD'), variant: 'primary', icon: 'lock', action: () => this.submitClosePeriod() },
      ],
    });
  }

  closeClosePeriodModal(): void {
    this.closePeriodRef?.close();
    this.closePeriodRef = null;
    this.periodBeingClosed = null;
  }

  submitClosePeriod(): void {
    const period = this.periodBeingClosed;
    if (!period || this.closingId() != null) return;
    this.closingId.set(period.id);
    this.error.set(null);
    this.periodSvc.closePeriod(period.id, {
      intercompanyInbound:  this.closeIntercompanyInbound(),
      intercompanyOutbound: this.closeIntercompanyOutbound(),
      intersedeInbound:     this.closeIntersedeInbound(),
      intersedeOutbound:    this.closeIntersedeOutbound(),
      wipPreviousYears:     this.closeWipPreviousYears(),
      salaryRecharges:      this.closeSalaryRecharges(),
      otherCostRecharges:   this.closeOtherCostRecharges(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: closed => this.applyAverageFteThenFinish(closed),
      error: (err: unknown) => {
        this.closingId.set(null);
        const e = err as { error?: { detail?: string; message?: string } };
        this.error.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('REPORTING.CLOSE_PERIOD_ERROR'));
      },
    });
  }

  /** Average FTE is a separate backend endpoint from the close waterfall (see `closeAverageFte`'s
   *  own doc) -- fired as a second call once close succeeds, only when the field was actually
   *  touched, so leaving it blank changes nothing (matches every other optional waterfall field's
   *  "missing = unchanged/zero" behaviour). A failure here still leaves the period closed; it's
   *  surfaced the same way as any other action error and can be corrected afterward from the
   *  report-detail screen (`PlPeriodService.setAverageFte` has no close-status gate). */
  private applyAverageFteThenFinish(closed: PlPeriodDto): void {
    const fte = this.closeAverageFte();
    if (fte === null) {
      this.periods.update(list => list.map(p => (p.id === closed.id ? closed : p)));
      this.closingId.set(null);
      this.closeClosePeriodModal();
      return;
    }
    this.periodSvc.setAverageFte(closed.id, fte).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.periods.update(list => list.map(p => (p.id === updated.id ? updated : p)));
        this.closingId.set(null);
        this.closeClosePeriodModal();
      },
      error: (err: unknown) => {
        this.periods.update(list => list.map(p => (p.id === closed.id ? closed : p)));
        this.closingId.set(null);
        this.closeClosePeriodModal();
        const e = err as { error?: { detail?: string; message?: string } };
        this.error.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('REPORTING.CLOSE_PERIOD_ERROR'));
      },
    });
  }
}
