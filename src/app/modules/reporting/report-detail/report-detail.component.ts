import {
  Component, DestroyRef, OnInit, TemplateRef, computed, effect, inject, input, signal, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, BadgeOptions, ButtonComponent, DafCellDirective, DataTableComponent,
  FormFieldComponent, FormFieldOptions, ModalService, PageComponent, PageHeaderComponent,
  RadioGroupComponent, RadioOption, SectionCardComponent, StatusBadgeComponent, TableColumn,
  TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import type { BreadcrumbItem, PageHeaderBadge } from '@khalilrebhiitec/daf360';

import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { UserStore } from '../../../core/user.store';
import { PlReportService } from '../pl-report.service';
import { PlPeriodService } from '../pl-period.service';
import { VarianceCommentaryService } from '../variance-commentary.service';
import {
  MissingCashRowDto, PlPeriodDto, PlReportDto, PlReportLineDto, PlReportStatus,
  ReceivableLineDto, ReopenMethod, VarianceCommentaryDto, VarianceCommentaryStatus,
  VarianceSectionType,
} from '../pl-reporting.model';

/** `daf-badge` variant per `PlReport.status` — same mapping as `reporting-list.component.ts`
 *  (duplicated locally rather than imported: that file is owned by a parallel Task 3.1/3.3
 *  effort and is explicitly off-limits for this task). */
const REPORT_STATUS_VARIANT: Record<PlReportStatus, NonNullable<BadgeOptions['variant']>> = {
  DRAFT:                'neutral',
  SUBMITTED:            'info',
  CD_ENDORSED:          'primary',
  GROUP_ACCEPTED:       'success',
  AMENDMENT_REQUESTED:  'warning',
  SUPERSEDED:           'neutral',
};

/** `daf-badge` variant per `VarianceCommentary.status`. */
const COMMENTARY_STATUS_VARIANT: Record<VarianceCommentaryStatus, NonNullable<BadgeOptions['variant']>> = {
  DRAFT:         'neutral',
  UNDER_REVIEW:  'info',
};

/** Fixed display order for the 4 cross-cutting narrative sections. */
const SECTION_ORDER: VarianceSectionType[] = ['REVENUE', 'COST', 'EBITDA', 'OTHER_NOTABLE'];

/**
 * `daf-badge` variant per `ReceivableLineDto.ageingCategory` -- green-to-red severity, same
 * variant vocabulary this file already uses (`success`/`info`/`warning`) plus `danger` for the
 * two most-overdue buckets (a valid `BadgeVariant` not yet used elsewhere in *this* file, but the
 * house-standard choice for ageing severity -- see `payments-display.ts`'s `retardVariant`, which
 * already escalates days-late to `warning`/`danger` the same way). The i18n key suffix lets the
 * raw backend string (not translatable as-is, e.g. `"<30 Days"`) resolve to a proper FR/EN label. */
const AGEING_BADGE: Record<string, { key: string; variant: NonNullable<BadgeOptions['variant']> }> = {
  'Not Overdue':  { key: 'NOT_OVERDUE', variant: 'success' },
  '<30 Days':     { key: 'LT_30',       variant: 'info' },
  '31-60 Days':   { key: 'B31_60',      variant: 'warning' },
  '61-180 Days':  { key: 'B61_180',     variant: 'warning' },
  '181-365 Days': { key: 'B181_365',    variant: 'danger' },
  '> 365 Days':   { key: 'GT_365',      variant: 'danger' },
};

interface LineCommentaryVm {
  line: PlReportLineDto;
  commentary: VarianceCommentaryDto | null;
}

/**
 * P&L report detail (F.08) — recap table + variance commentary editor + the 4 cross-cutting
 * narrative sections + the submit/endorse/accept/request-amendment/reopen action bar + Excel/PDF
 * export.
 *
 * Variance commentary save strategy: one "Enregistrer" button PER ROW (not a single page-level
 * batch button). Each row's narrative is independent, backend-wise (`PUT
 * /variance-commentaries/{id}`, one row at a time) and workflow-wise (a Finance Manager typically
 * finishes one line's commentary before moving to the next) — a per-row button gives immediate
 * feedback (saving/saved/error) scoped to that one row, instead of one page-wide "did it all
 * work?" state after a batch call the backend doesn't actually expose as a batch endpoint.
 *
 * Reopens `ngOnInit`'s usual "load once" shape with a reactive `effect()` on the `id` route
 * input instead: `OPTION_1_VERSIONED` reopen can hand back a *different* report id (the new
 * version), and this component then `router.navigate`s to it while staying mounted on the same
 * `:id` route — Angular reuses the component instance in that case and would never re-run
 * `ngOnInit`, so the reload has to react to the input signal itself.
 */
@Component({
  selector: 'app-report-detail',
  imports: [
    TranslatePipe,
    PageComponent, PageHeaderComponent, SectionCardComponent, ButtonComponent, FormFieldComponent,
    DataTableComponent, DafCellDirective, StatusBadgeComponent, RadioGroupComponent,
  ],
  providers: [DisplayCurrencyPipe],
  templateUrl: './report-detail.component.html',
})
export class ReportDetailComponent implements OnInit {
  private readonly reportSvc     = inject(PlReportService);
  private readonly periodSvc     = inject(PlPeriodService);
  private readonly commentarySvc = inject(VarianceCommentaryService);
  private readonly translate     = inject(TranslateService);
  private readonly currency      = inject(DisplayCurrencyPipe);
  private readonly modals        = inject(ModalService);
  private readonly userStore     = inject(UserStore);
  private readonly router        = inject(Router);
  private readonly route         = inject(ActivatedRoute);
  private readonly destroyRef    = inject(DestroyRef);

  private readonly reasonTpl  = viewChild.required<TemplateRef<unknown>>('reasonTpl');
  private readonly reopenTpl  = viewChild.required<TemplateRef<unknown>>('reopenTpl');

  id = input<string>();

  // ── Data ─────────────────────────────────────────────────────────────────
  report       = signal<PlReportDto | null>(null);
  lines        = signal<PlReportLineDto[]>([]);
  period       = signal<PlPeriodDto | null>(null);
  commentaries = signal<VarianceCommentaryDto[]>([]);

  loading     = signal(false);
  error       = signal<string | null>(null);
  actionError = signal<string | null>(null);
  actionSaving = signal(false);
  exportingXlsx = signal(false);
  exportingPdf  = signal(false);
  isExportingWorkbook = signal(false);

  // ── Cash position (Receivables / Missing Cash) -- lazy-loaded on first toggle ─────────────
  showReceivables      = signal(false);
  isLoadingReceivables = signal(false);
  receivables          = signal<ReceivableLineDto[]>([]);

  showMissingCash      = signal(false);
  isLoadingMissingCash = signal(false);
  missingCash          = signal<MissingCashRowDto[]>([]);

  readonly canManageCommentary = computed(() => this.userStore.hasPermission('FACT_MANAGE_PL_REPORT'));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  /** See class doc: an `effect()`, not just `ngOnInit`, so navigating to a new report id
   *  (OPTION_1_VERSIONED reopen) on the same route reloads without a fresh component instance. */
  constructor() {
    effect(() => {
      const numId = Number(this.id());
      if (numId) this.load(numId);
    });
  }

  ngOnInit(): void {
    // Intentionally empty — the constructor's effect() already runs once on first render and
    // again on every `id()` change, which covers both the initial load and the reopen-navigation
    // case. Kept to make the component's lifecycle intent explicit (`implements OnInit`).
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.actionError.set(null);
    this.reportSvc.getReport(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: detail => {
        this.report.set(detail.report);
        this.lines.set(detail.lines);
        this.loading.set(false);
        this.loadSecondary(detail.report);
      },
      error: () => {
        this.error.set(this.translate.instant('REPORTING.DETAIL.LOAD_ERROR'));
        this.loading.set(false);
      },
    });
  }

  /** `PlPeriodDto` (for `ebitda`/`revenueLocal`) and the commentary rows load in parallel,
   *  once the report (and therefore its `plPeriodId`) is known. */
  private loadSecondary(report: PlReportDto): void {
    forkJoin({
      period:       this.periodSvc.getPeriod(report.plPeriodId),
      commentaries: this.commentarySvc.getByReport(report.id),
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: ({ period, commentaries }) => {
        this.period.set(period);
        this.commentaries.set(commentaries);
      },
      error: () => {
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.SECONDARY_LOAD_ERROR'));
      },
    });
  }

  refresh(): void {
    const numId = Number(this.id());
    if (numId) this.load(numId);
  }

  // ── Header ───────────────────────────────────────────────────────────────

  private periodLabel(p: PlPeriodDto | null): string {
    if (!p) return '';
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    const label = new Date(p.periodYear, p.periodMonth - 1, 1)
      .toLocaleDateString(locale, { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }

  readonly headerTitle = computed(() => {
    this.translate.currentLang();
    const p = this.period();
    const prefix = this.translate.instant('REPORTING.DETAIL.TITLE_PREFIX');
    return p ? `${prefix} ${this.periodLabel(p)}` : prefix;
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() => {
    const r = this.report();
    if (!r) return [];
    this.translate.currentLang();
    return [{
      label:   this.translate.instant(`REPORTING.REPORT_STATUS.${r.status}`),
      variant: REPORT_STATUS_VARIANT[r.status] ?? 'neutral',
      dot:     true,
    }];
  });

  readonly breadcrumbs = computed<BreadcrumbItem[]>(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('REPORTING.DETAIL.BACK'), link: ['..'] },
      { label: this.headerTitle() },
    ];
  });

  // ── Recap table ──────────────────────────────────────────────────────────

  private formatVariancePct(v: number | null): string {
    if (v == null) return '—';
    const sign = v > 0 ? '+' : '';
    return `${sign}${v.toFixed(2)}%`;
  }

  /** Lines pre-sorted by `sortOrder` per the DTO contract — re-sorted defensively here since
   *  nothing enforces that order survives a future `commentaries.update` re-assignment. */
  private readonly sortedLines = computed(() => [...this.lines()].sort((a, b) => a.sortOrder - b.sortOrder));

  readonly recapColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'label',    label: t('REPORTING.DETAIL.RECAP.LINE'),     type: 'text' },
      { key: 'amount',   label: t('REPORTING.DETAIL.RECAP.ACTUAL'),   type: 'text', align: 'right' },
      { key: 'budget',   label: t('REPORTING.DETAIL.RECAP.BUDGET'),   type: 'text', align: 'right' },
      { key: 'variance', label: t('REPORTING.DETAIL.RECAP.VARIANCE'), type: 'text', align: 'right' },
    ];
  });

  readonly recapRows = computed<TableRow[]>(() => this.sortedLines().map(line => ({
    id:       line.id,
    label:    line.catalogueLineLabelFr,
    amount:   this.currency.transform(line.amountLocal, 'TND'),
    budget:   line.budgetAmountLocal != null ? this.currency.transform(line.budgetAmountLocal, 'TND') : '—',
    variance: this.formatVariancePct(line.variancePct),
  })));

  readonly recapConfig = computed<TableConfig>(() => ({
    showHeader:   true,
    hoverable:    false,
    loading:      this.loading(),
    skeletonRows: 13,
    emptyMessage: this.translate.instant('REPORTING.EMPTY'),
  }));

  /** EBITDA total row — the joined `PlPeriodDto`'s own field, never recomputed client-side. */
  readonly ebitdaDisplay = computed(() => this.currency.transform(this.period()?.ebitda ?? null, 'TND'));

  /** Revenue waterfall rows — all sourced straight from the joined `PlPeriodDto`, never
   *  recomputed client-side (same approach as `ebitdaDisplay` above). */
  readonly grossRevenue1Display = computed(() => this.currency.transform(this.period()?.grossRevenue1Local ?? null, 'TND'));
  readonly grossRevenue2Display = computed(() => this.currency.transform(this.period()?.grossRevenue2Local ?? null, 'TND'));
  readonly netRevenueDisplay    = computed(() => this.currency.transform(this.period()?.netRevenueLocal ?? null, 'TND'));
  readonly ebitdaPctDisplay     = computed(() => {
    const pct = this.period()?.ebitdaPct;
    return pct == null ? '—' : `${pct.toFixed(1)}%`;
  });

  /** 4 KPI cards -- built only from fields confirmed real on `PlPeriodDto` today, reusing the
   *  4 display computeds just above verbatim (same currency/format logic, zero duplication). */
  readonly kpiCards = computed(() => {
    this.translate.currentLang();
    return [
      { label: this.translate.instant('REPORTING.WATERFALL.GROSS_REVENUE_2'), value: this.grossRevenue2Display() },
      { label: this.translate.instant('REPORTING.WATERFALL.NET_REVENUE'),     value: this.netRevenueDisplay() },
      { label: this.translate.instant('REPORTING.TABLE.EBITDA'),              value: this.ebitdaDisplay() },
      { label: this.translate.instant('REPORTING.WATERFALL.EBITDA_PCT'),      value: this.ebitdaPctDisplay() },
    ];
  });

  // ── Variance commentary (per-line) ──────────────────────────────────────

  readonly lineCommentaryVms = computed<LineCommentaryVm[]>(() => {
    const list = this.commentaries();
    return this.sortedLines().map(line => ({
      line,
      commentary: list.find(c => c.catalogueLineId === line.catalogueLineId) ?? null,
    }));
  });

  /** Edited-but-not-yet-saved narrative text, keyed by `VarianceCommentaryDto.id`. */
  private readonly commentaryDrafts = signal<Record<number, string>>({});
  private readonly savingCommentaryIds = signal<Set<number>>(new Set());

  draftFor(c: VarianceCommentaryDto): string {
    const draft = this.commentaryDrafts()[c.id];
    return draft !== undefined ? draft : c.narrative;
  }

  onDraftChange(c: VarianceCommentaryDto, value: string | number | null): void {
    this.commentaryDrafts.update(map => ({ ...map, [c.id]: String(value ?? '') }));
  }

  isDirty(c: VarianceCommentaryDto): boolean {
    const draft = this.commentaryDrafts()[c.id];
    return draft !== undefined && draft !== c.narrative;
  }

  isSavingCommentary(c: VarianceCommentaryDto): boolean {
    return this.savingCommentaryIds().has(c.id);
  }

  commentaryFieldOptions(c: VarianceCommentaryDto): FormFieldOptions {
    return {
      type: 'textarea', rows: 3, fullWidth: true,
      label: this.translate.instant('REPORTING.DETAIL.COMMENTARY.NARRATIVE_LABEL'),
      disabled: !this.canManageCommentary() || this.isSavingCommentary(c),
    };
  }

  statusBadge(status: VarianceCommentaryStatus): BadgeCell {
    return {
      label:   this.translate.instant(`REPORTING.DETAIL.COMMENTARY.STATUS.${status}`),
      options: { variant: COMMENTARY_STATUS_VARIANT[status] ?? 'neutral', dot: true, size: 'sm' },
    };
  }

  saveCommentary(c: VarianceCommentaryDto): void {
    const narrative = this.draftFor(c).trim();
    this.savingCommentaryIds.update(s => new Set(s).add(c.id));
    this.actionError.set(null);
    this.commentarySvc.update(c.id, { narrative }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: updated => {
        this.commentaries.update(list => list.map(item => item.id === updated.id ? updated : item));
        this.commentaryDrafts.update(map => {
          const copy = { ...map };
          delete copy[c.id];
          return copy;
        });
        this.savingCommentaryIds.update(s => { const copy = new Set(s); copy.delete(c.id); return copy; });
      },
      error: () => {
        this.savingCommentaryIds.update(s => { const copy = new Set(s); copy.delete(c.id); return copy; });
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  // ── Cross-cutting narrative sections ────────────────────────────────────

  readonly sectionCommentaries = computed<VarianceCommentaryDto[]>(() => {
    const list = this.commentaries().filter(c => c.catalogueLineId == null && c.sectionType != null);
    return [...list].sort((a, b) =>
      SECTION_ORDER.indexOf(a.sectionType as VarianceSectionType)
      - SECTION_ORDER.indexOf(b.sectionType as VarianceSectionType));
  });

  sectionLabel(type: VarianceSectionType | null): string {
    return type ? this.translate.instant(`REPORTING.DETAIL.SECTION.${type}`) : '';
  }

  // ── Action bar — status + permission gated (see class doc) ──────────────

  readonly status = computed<PlReportStatus | null>(() => this.report()?.status ?? null);

  readonly canSubmit = computed(() =>
    this.userStore.hasPermission('FACT_MANAGE_PL_REPORT')
    && ['DRAFT', 'AMENDMENT_REQUESTED'].includes(this.status() ?? ''));

  readonly canEndorse = computed(() =>
    this.userStore.hasPermission('FACT_ENDORSE_PL_REPORT') && this.status() === 'SUBMITTED');

  readonly canAccept = computed(() =>
    this.userStore.hasPermission('FACT_ACCEPT_PL_REPORT') && this.status() === 'CD_ENDORSED');

  readonly canRequestAmendment = computed(() =>
    (this.userStore.hasPermission('FACT_ACCEPT_PL_REPORT') || this.userStore.hasPermission('FACT_ENDORSE_PL_REPORT'))
    && ['SUBMITTED', 'CD_ENDORSED'].includes(this.status() ?? ''));

  readonly canReopen = computed(() =>
    this.userStore.hasPermission('FACT_ACCEPT_PL_REPORT') && this.status() === 'GROUP_ACCEPTED');

  private runAction(call: (id: number) => { subscribe: (o: { next: (v: PlReportDto) => void; error: (e: unknown) => void }) => void }): void {
    const report = this.report();
    if (!report) return;
    const currentId = report.id;
    this.actionSaving.set(true);
    this.actionError.set(null);
    call(currentId).subscribe({
      next: (updated: PlReportDto) => {
        this.actionSaving.set(false);
        if (updated.id !== currentId) {
          // OPTION_1_VERSIONED reopen: the response is the NEW version — navigate to it.
          // The constructor's effect() picks up the new `id()` input and reloads.
          this.router.navigate(['..', updated.id], { relativeTo: this.route });
        } else {
          this.refresh();
        }
      },
      error: (err: unknown) => {
        this.actionSaving.set(false);
        const e = err as { error?: { detail?: string; message?: string } };
        this.actionError.set(e?.error?.detail ?? e?.error?.message
          ?? this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  submit(): void  { this.runAction(id => this.reportSvc.submit(id)); }
  endorse(): void { this.runAction(id => this.reportSvc.endorse(id)); }
  accept(): void  { this.runAction(id => this.reportSvc.accept(id)); }

  // ── Request amendment — single-field reason modal ───────────────────────

  readonly reasonText = signal('');

  readonly reasonFieldOptions = computed<FormFieldOptions>(() => {
    this.translate.currentLang();
    return {
      type: 'textarea', rows: 3, maxLength: 500, fullWidth: true, required: true,
      label: this.translate.instant('REPORTING.DETAIL.ACTIONS.REASON_LABEL'),
    };
  });

  onReasonChange(value: string | number | null): void {
    this.reasonText.set(String(value ?? ''));
  }

  openRequestAmendmentModal(): void {
    this.reasonText.set('');
    const ref = this.modals.open({
      title: this.translate.instant('REPORTING.DETAIL.ACTIONS.REQUEST_AMENDMENT'),
      size:  'md',
      body:  this.reasonTpl(),
      buttons: [
        { label: this.translate.instant('REPORTING.DETAIL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('REPORTING.DETAIL.CONFIRM'),
          variant: 'primary',
          action: () => {
            const reason = this.reasonText().trim();
            if (!reason) return;
            ref.close();
            this.runAction(id => this.reportSvc.requestAmendment(id, { reason }));
          },
        },
      ],
    });
  }

  // ── Reopen — method choice + rationale modal ────────────────────────────

  readonly reopenMethod = signal<ReopenMethod>('OPTION_1_VERSIONED');
  readonly reopenRationale = signal('');

  readonly reopenMethodOptions = computed<RadioOption[]>(() => {
    this.translate.currentLang();
    return [
      {
        value: 'OPTION_1_VERSIONED',
        label: this.translate.instant('REPORTING.DETAIL.REOPEN.OPTION_1_VERSIONED'),
      },
      {
        value: 'OPTION_2_CONSUMED',
        label: this.translate.instant('REPORTING.DETAIL.REOPEN.OPTION_2_CONSUMED'),
      },
    ];
  });

  readonly reopenRationaleFieldOptions = computed<FormFieldOptions>(() => {
    this.translate.currentLang();
    return {
      type: 'textarea', rows: 3, maxLength: 500, fullWidth: true, required: true,
      label: this.translate.instant('REPORTING.DETAIL.REOPEN.RATIONALE_LABEL'),
    };
  });

  onReopenMethodChange(value: string): void {
    this.reopenMethod.set(value as ReopenMethod);
  }

  onReopenRationaleChange(value: string | number | null): void {
    this.reopenRationale.set(String(value ?? ''));
  }

  openReopenModal(): void {
    this.reopenMethod.set('OPTION_1_VERSIONED');
    this.reopenRationale.set('');
    const ref = this.modals.open({
      title: this.translate.instant('REPORTING.DETAIL.ACTIONS.REOPEN'),
      size:  'md',
      body:  this.reopenTpl(),
      buttons: [
        { label: this.translate.instant('REPORTING.DETAIL.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('REPORTING.DETAIL.CONFIRM'),
          variant: 'primary',
          action: () => {
            const rationale = this.reopenRationale().trim();
            if (!rationale) return;
            ref.close();
            this.runAction(id => this.reportSvc.reopen(id, { method: this.reopenMethod(), rationale }));
          },
        },
      ],
    });
  }

  // ── Export ───────────────────────────────────────────────────────────────

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /** With `responseType: 'blob'`, an error response body also arrives as a Blob (never
   *  pre-parsed JSON) — re-read it as text to extract the real `ProblemDetail.detail`.
   *  Same helper as `invoice-detail.component.ts`'s `readBlobError`. */
  private async readBlobError(err: unknown): Promise<string> {
    const fallback = this.translate.instant('REPORTING.DETAIL.ACTION_ERROR');
    const body = (err as { error?: unknown } | null)?.error;
    if (body instanceof Blob) {
      try {
        const text = await body.text();
        const parsed = JSON.parse(text);
        return parsed?.detail ?? parsed?.message ?? fallback;
      } catch {
        return fallback;
      }
    }
    return fallback;
  }

  exportXlsx(): void {
    const report = this.report();
    if (!report) return;
    this.exportingXlsx.set(true);
    this.actionError.set(null);
    this.reportSvc.exportXlsx(report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        this.exportingXlsx.set(false);
        this.downloadBlob(blob, `rapport-pl-${report.id}.xlsx`);
      },
      error: (err: unknown) => {
        this.exportingXlsx.set(false);
        this.readBlobError(err).then(msg => this.actionError.set(msg));
      },
    });
  }

  exportPdf(): void {
    const report = this.report();
    if (!report) return;
    this.exportingPdf.set(true);
    this.actionError.set(null);
    this.reportSvc.exportPdf(report.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        this.exportingPdf.set(false);
        this.downloadBlob(blob, `rapport-pl-${report.id}.pdf`);
      },
      error: (err: unknown) => {
        this.exportingPdf.set(false);
        this.readBlobError(err).then(msg => this.actionError.set(msg));
      },
    });
  }

  /** Full 7-tab workbook export -- keyed by `PlPeriod.id` (via the joined `period()`), NOT
   *  `report.id` like `exportXlsx()`/`exportPdf()` above: distinct id space, distinct backend
   *  endpoint (`PlPeriodService.exportWorkbook`), distinct button -- see class doc. Reuses the
   *  same `downloadBlob()`/`readBlobError()` helpers as the two methods above. */
  downloadWorkbook(): void {
    const period = this.period();
    if (!period) return;
    this.isExportingWorkbook.set(true);
    this.actionError.set(null);
    this.periodSvc.exportWorkbook(period.id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: blob => {
        this.isExportingWorkbook.set(false);
        this.downloadBlob(blob, `P_L_Workbook_${period.periodYear}_${period.periodMonth}.xlsx`);
      },
      error: (err: unknown) => {
        this.isExportingWorkbook.set(false);
        this.readBlobError(err).then(msg => this.actionError.set(msg));
      },
    });
  }

  // ── Cash position (Receivables / Missing Cash) -- lazy-loaded tables, `FACT_VIEW_PL_REPORT` ──

  private formatDate(iso: string | null): string {
    if (!iso) return '—';
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return new Date(iso).toLocaleDateString(locale);
  }

  /** `ageingCategory` is a fixed backend vocabulary (see `AGEING_BADGE`), not itself
   *  translatable text -- map it to an i18n key the same way `statusBadge()` above maps a status
   *  enum, falling back to the raw string (shown as-is) for any value not in the map. */
  private ageingBadge(category: string): BadgeCell {
    const meta = AGEING_BADGE[category];
    return {
      label:   meta ? this.translate.instant(`REPORTING.DETAIL.CASH.AGEING.${meta.key}`) : category,
      options: { variant: meta?.variant ?? 'neutral', dot: true, size: 'sm' },
    };
  }

  toggleReceivables(): void {
    if (this.showReceivables()) { this.showReceivables.set(false); return; }
    if (this.receivables().length > 0) { this.showReceivables.set(true); return; }
    const paysId = this.period()?.paysId;
    if (!paysId) return;
    this.isLoadingReceivables.set(true);
    this.actionError.set(null);
    this.reportSvc.getReceivables(paysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.receivables.set(data);
        this.isLoadingReceivables.set(false);
        this.showReceivables.set(true);
      },
      error: () => {
        this.isLoadingReceivables.set(false);
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  readonly receivablesColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'invoiceNumber',  label: t('REPORTING.DETAIL.CASH.RECEIVABLES.INVOICE'),      type: 'text', sortable: true },
      { key: 'clientName',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.CLIENT'),       type: 'text', sortable: true },
      { key: 'clientType',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.CLIENT_TYPE'),  type: 'text' },
      { key: 'amountIncTax',   label: t('REPORTING.DETAIL.CASH.RECEIVABLES.AMOUNT'),       type: 'text', align: 'right', sortable: true },
      { key: 'dueDate',        label: t('REPORTING.DETAIL.CASH.RECEIVABLES.DUE_DATE'),     type: 'text', sortable: true },
      { key: 'daysAgeing',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.DAYS_AGEING'),  type: 'text', align: 'right', sortable: true },
      { key: 'ageingCategory', label: t('REPORTING.DETAIL.CASH.RECEIVABLES.AGEING'),       type: 'badge',
        sortAccessor: (row: TableRow) => (row['ageingCategory'] as BadgeCell).label },
    ];
  });

  /** Rendered exactly as returned by the backend -- not re-sorted client-side. */
  readonly receivablesRows = computed<TableRow[]>(() => this.receivables().map((r, i) => ({
    id:             i,
    invoiceNumber:  r.invoiceNumber,
    clientName:     r.clientName,
    clientType:     r.clientType,
    amountIncTax:   this.currency.transform(r.amountIncTax, r.currency),
    dueDate:        this.formatDate(r.dueDate),
    daysAgeing:     String(r.daysAgeing),
    ageingCategory: this.ageingBadge(r.ageingCategory),
  })));

  readonly receivablesConfig = computed<TableConfig>(() => ({
    showHeader:   true,
    hoverable:    false,
    loading:      this.isLoadingReceivables(),
    skeletonRows: 5,
    emptyMessage: this.translate.instant('REPORTING.DETAIL.CASH.RECEIVABLES.EMPTY'),
  }));

  toggleMissingCash(): void {
    if (this.showMissingCash()) { this.showMissingCash.set(false); return; }
    if (this.missingCash().length > 0) { this.showMissingCash.set(true); return; }
    const paysId = this.period()?.paysId;
    if (!paysId) return;
    this.isLoadingMissingCash.set(true);
    this.actionError.set(null);
    this.reportSvc.getMissingCash(paysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.missingCash.set(data);
        this.isLoadingMissingCash.set(false);
        this.showMissingCash.set(true);
      },
      error: () => {
        this.isLoadingMissingCash.set(false);
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  readonly missingCashColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { key: 'projectRef',       label: t('REPORTING.DETAIL.CASH.MISSING_CASH.PROJECT'),           type: 'text' },
      { key: 'arTotal',          label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_TOTAL'),           type: 'text', align: 'right' },
      { key: 'arNotOverdue',     label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_NOT_OVERDUE'),     type: 'text', align: 'right' },
      { key: 'arLt1Month',       label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_LT_1M'),           type: 'text', align: 'right' },
      { key: 'ar1To2Months',     label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_1_2M'),            type: 'text', align: 'right' },
      { key: 'ar2To3Months',     label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_2_3M'),            type: 'text', align: 'right' },
      { key: 'ar3To6Months',     label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_3_6M'),            type: 'text', align: 'right' },
      { key: 'ar6To12Months',    label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_6_12M'),           type: 'text', align: 'right' },
      { key: 'arGt1Year',        label: t('REPORTING.DETAIL.CASH.MISSING_CASH.AR_GT_1Y'),           type: 'text', align: 'right' },
      { key: 'wipTotal',         label: t('REPORTING.DETAIL.CASH.MISSING_CASH.WIP_TOTAL'),          type: 'text', align: 'right' },
      { key: 'missingCashTotal', label: t('REPORTING.DETAIL.CASH.MISSING_CASH.MISSING_CASH_TOTAL'), type: 'custom', align: 'right' },
    ];
  });

  /** Rendered exactly as returned by the backend -- already sorted descending by
   *  `missingCashTotal` server-side (`CashPositionService`); never re-sorted client-side. */
  readonly missingCashRows = computed<TableRow[]>(() => this.missingCash().map((m, i) => ({
    id:                i,
    projectRef:        m.projectRef,
    arTotal:           this.currency.transform(m.arTotal, 'TND'),
    arNotOverdue:      this.currency.transform(m.arNotOverdue, 'TND'),
    arLt1Month:        this.currency.transform(m.arLt1Month, 'TND'),
    ar1To2Months:      this.currency.transform(m.ar1To2Months, 'TND'),
    ar2To3Months:      this.currency.transform(m.ar2To3Months, 'TND'),
    ar3To6Months:      this.currency.transform(m.ar3To6Months, 'TND'),
    ar6To12Months:     this.currency.transform(m.ar6To12Months, 'TND'),
    arGt1Year:         this.currency.transform(m.arGt1Year, 'TND'),
    wipTotal:          this.currency.transform(m.wipTotal, 'TND'),
    missingCashTotal:  this.currency.transform(m.missingCashTotal, 'TND'),
  })));

  readonly missingCashConfig = computed<TableConfig>(() => ({
    showHeader:   true,
    hoverable:    false,
    loading:      this.isLoadingMissingCash(),
    skeletonRows: 5,
    emptyMessage: this.translate.instant('REPORTING.DETAIL.CASH.MISSING_CASH.EMPTY'),
  }));
}
