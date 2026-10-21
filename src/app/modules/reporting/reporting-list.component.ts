import { Component, DestroyRef, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, BadgeOptions, ButtonComponent, DafCellDirective, DataTableComponent,
  FormFieldComponent, ModalRef, ModalService, PageComponent, PageHeaderComponent, SelectComponent, SelectOption,
  StatusBadgeComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ClientService } from '../clients/client.service';
import { PaysRefDto, paysLabel } from '../affaires/affaire.model';
import { PaysFlagSelectComponent, PaysFlagOption } from '../../shared/pays-flag-select/pays-flag-select.component';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';
import { UserStore } from '../../core/user.store';
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

/**
 * P&L Reporting (F.08) — period/report list.
 *
 * One row per `PlPeriod` for the selected pays, joined against its current `PlReport` (if
 * any — a period can be CLOSED with no report yet). Generating a report
 * (`POST /from-period/{periodId}`) only makes sense once a period is CLOSED and only for
 * someone holding `FACT_MANAGE_PL_REPORT`; clicking a row that already has a report opens
 * its detail screen (Task 3.2).
 */
@Component({
  selector: 'app-reporting-list',
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent,
    DataTableComponent, DafCellDirective, StatusBadgeComponent, PaysFlagSelectComponent,
    SelectComponent, FormFieldComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './reporting-list.component.html',
})
export class ReportingListComponent implements OnInit {
  private readonly periodSvc = inject(PlPeriodService);
  private readonly reportSvc = inject(PlReportService);
  private readonly clientSvc = inject(ClientService);
  private readonly userStore = inject(UserStore);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly translate = inject(TranslateService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly modal     = inject(ModalService);

  // ── Pays selector — same pattern as admin-list.component.ts ────────────────
  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  readonly paysOptions = computed<PaysFlagOption[]>(() =>
    this.paysList().map(p => ({
      value: String(p.id),
      label: `${paysLabel(p, this.translate.currentLang())} (${p.isoCode})`,
      isoCode: p.isoCode,
    })));

  readonly paysSelectLabel = computed(() => {
    this.translate.currentLang();
    return this.translate.instant('REPORTING.PAYS.LABEL');
  });

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
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ myPays, allPays, paysInUse }) => {
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

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'period',       label: t('REPORTING.TABLE.PERIOD'), type: 'text',   sortable: true },
      { key: 'periodStatus', label: t('REPORTING.TABLE.STATUS'), type: 'custom', sortable: true,
        sortAccessor: (row: TableRow) => (row['periodStatus'] as BadgeCell).label },
      { key: 'ebitda',       label: t('REPORTING.TABLE.EBITDA'), type: 'text',   sortable: true, align: 'right' },
      { key: 'ebitdaPct',    label: t('REPORTING.TABLE.EBITDA_PCT'), type: 'text', sortable: true, align: 'right' },
      { key: 'report',       label: t('REPORTING.TABLE.REPORT'), type: 'custom' },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return [...this.periods()]
      .sort((a, b) => (b.periodYear - a.periodYear) || (b.periodMonth - a.periodMonth))
      .map(period => {
        const report = this.currentReportFor(period.id);
        return {
          id:           period.id,
          period:       this.periodLabel(period),
          periodStatus: {
            label:   t(`REPORTING.PERIOD_STATUS.${period.status}`),
            options: { variant: PERIOD_STATUS_VARIANT[period.status] ?? 'neutral', dot: true, size: 'sm' },
          } satisfies BadgeCell,
          ebitda:    this.currency.transform(period.ebitda, 'TND'),
          ebitdaPct: period.ebitdaPct == null ? '—' : `${period.ebitdaPct.toFixed(1)}%`,

          // Read by the projected 'report' cell template below.
          _reportBadge: report
            ? ({
                label:   t(`REPORTING.REPORT_STATUS.${report.status}`),
                options: { variant: REPORT_STATUS_VARIANT[report.status] ?? 'neutral', dot: true, size: 'sm' },
              } satisfies BadgeCell)
            : null,
          _reportId:     report?.id ?? null,
          _canGenerate:  period.status === 'CLOSED' && !report && this.canManage(),
          _canClose:     period.status === 'OPEN' && this.canManagePeriod(),
          _period:       period,
        };
      });
  });

  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   true,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: 8,
      emptyMessage: this.translate.instant('REPORTING.EMPTY'),
    };
  });

  onRowClick(row: TableRow): void {
    const reportId = row['_reportId'] as number | null;
    if (reportId != null) this.router.navigate([reportId], { relativeTo: this.route });
  }

  goToBudget(): void {
    this.router.navigate(['budget'], { relativeTo: this.route });
  }

  goToCalendar(): void {
    this.router.navigate(['calendar'], { relativeTo: this.route });
  }

  /** Projected button in the 'report' cell — stops the click from also firing `rowClick`. */
  onGenerate(period: PlPeriodDto, event: MouseEvent): void {
    event.stopPropagation();
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
    this.newPeriodYear.set(this.currentYear);
    this.newPeriodMonth.set(this.currentMonth);
    const t = (k: string) => this.translate.instant(k);
    this.newPeriodRef = this.modal.open({
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
      paysId:      this.paysId(),
      periodYear:  this.newPeriodYear(),
      periodMonth: this.newPeriodMonth(),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: period => {
        this.creatingPeriod.set(false);
        this.periods.update(list => [...list, period]);
        this.closeCreatePeriod();
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

  /** Projected button in the 'periodStatus' cell — stops the click from also firing `rowClick`. */
  openClosePeriod(period: PlPeriodDto, event: MouseEvent): void {
    event.stopPropagation();
    this.periodBeingClosed = period;
    this.closeIntercompanyInbound.set(null);
    this.closeIntercompanyOutbound.set(null);
    this.closeIntersedeInbound.set(null);
    this.closeIntersedeOutbound.set(null);
    this.closeWipPreviousYears.set(null);
    this.closeSalaryRecharges.set(null);
    this.closeOtherCostRecharges.set(null);
    const t = (k: string) => this.translate.instant(k);
    this.closePeriodRef = this.modal.open({
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
      next: closed => {
        this.periods.update(list => list.map(p => (p.id === closed.id ? closed : p)));
        this.closingId.set(null);
        this.closeClosePeriodModal();
      },
      error: (err: unknown) => {
        this.closingId.set(null);
        const e = err as { error?: { detail?: string; message?: string } };
        this.error.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('REPORTING.CLOSE_PERIOD_ERROR'));
      },
    });
  }
}
