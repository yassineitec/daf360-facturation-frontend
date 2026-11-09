import {
  Component, DestroyRef, OnInit, TemplateRef, computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { forkJoin } from 'rxjs';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AccordionCardComponent, BadgeCell, BadgeOptions, BarChartComponent, ButtonComponent, DafCellDirective, DataTableComponent,
  FormFieldComponent, FormFieldOptions, MetricCardComponent, ModalService, PageComponent, PageHeaderComponent,
  ProgressBarComponent, RadioGroupComponent, RadioOption, SearchToolbarComponent, SectionCardComponent,
  TableColumn, TableConfig, TableRow, TabsComponent, tabParam,
} from '@khalilrebhiitec/daf360';
import type {
  AccordionCardOptions, BarChartBar, BarChartOptions, BreadcrumbItem, ButtonOptions, FilterField, FilterResult,
  MetricCardOptions, MetricDelta, PageHeaderBadge, ProgressBarOptions, SearchToolbarFilterConfig, TabItem,
} from '@khalilrebhiitec/daf360';

import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { tableTools } from '../../../shared/table-tools';
import { UserStore } from '../../../core/user.store';
import { ClientService } from '../../clients/client.service';
import { PaysRefDto, paysLabel } from '../../affaires/affaire.model';
import { PlReportService } from '../pl-report.service';
import { PlPeriodService } from '../pl-period.service';
import { VarianceCommentaryService } from '../variance-commentary.service';
import {
  MissingCashRowDto, PlPeriodDto, PlReportDto, PlReportLineDto, PlReportStatus,
  ReceivableLineDto, ReopenMethod, VarianceCommentaryDto,
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

/** Fixed display order for the 4 cross-cutting narrative sections. */
const SECTION_ORDER: VarianceSectionType[] = ['REVENUE', 'COST', 'EBITDA', 'OTHER_NOTABLE'];

/** Icon of each cross-cutting section's accordion card. */
const SECTION_ICON: Record<VarianceSectionType, string> = {
  REVENUE:       'payments',
  COST:          'trending_down',
  EBITDA:        'account_balance_wallet',
  OTHER_NOTABLE: 'star',
};

/** How much of the narrative the closed accordion card shows as its sub-line. */
const SECTION_PREVIEW_LENGTH = 90;

// ── Client-side table filters — same helpers as the affaire detail's TS/factures/paiements
//    toolbars (each list is loaded whole, so filtering never needs a backend call). ──────────

/** Jour calendaire local → 'yyyy-MM-dd' — jamais toISOString() (UTC, décale d'un jour). */
function toIsoDay(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Un jour ('yyyy-MM-dd…' ou date-heure ISO) dans la plage du filtre `daterange` (1 date =
 *  un seul jour). Sans plage : tout passe ; plage mais pas de date : exclu. */
function inDayRange(value: string | null | undefined, range: Date[] | null): boolean {
  if (!range || !range.length) return true;
  if (!value) return false;
  const day  = value.length <= 10 ? value : toIsoDay(new Date(value));
  const from = toIsoDay(range[0]);
  const to   = toIsoDay(range[1] ?? range[0]);
  return day >= from && day <= to;
}

/** Borne de montant saisie en texte ('1 500,50' accepté) → nombre, ou null si vide/invalide. */
function parseAmount(raw: string): number | null {
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Montant dans [min, max] ; une borne nulle est ignorée, un montant absent est exclu dès
 *  qu'une borne est posée. */
function inAmountRange(amount: number | null | undefined, min: number | null, max: number | null): boolean {
  if (min == null && max == null) return true;
  if (amount == null) return false;
  return (min == null || amount >= min) && (max == null || amount <= max);
}

/** `daf-filter` renders a select as `string[]` internally and emits a scalar — normalise both. */
function asFilterValue(result: FilterResult, key: string): string {
  const v = result[key];
  if (Array.isArray(v)) return (v[0] as string) ?? '';
  return typeof v === 'string' ? v : '';
}

/** `daterange` émet Date[] (1 ou 2 dates) ; tout le reste → null. */
function asDateRange(result: FilterResult, key: string): Date[] | null {
  const v = result[key];
  return Array.isArray(v) && v.length ? v as Date[] : null;
}

function asText(result: FilterResult, key: string): string {
  const v = result[key];
  return typeof v === 'string' ? v : '';
}

/** Recap "Écart" filter values. */
type VarianceFilter = '' | 'over' | 'under' | 'no-budget';

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

type ReportTab = 'overview' | 'recap' | 'commentaires' | 'tresorerie';
type CashTab = 'receivables' | 'missing-cash';
type CommentaryTab = 'lines' | 'sections';

interface KpiTile {
  label: string;
  value: string;
  delta: MetricDelta | null;
  options: MetricCardOptions;
}

/** One key/value row of the left details panel (`.dp-row`). `ok` paints it as a done state. */
interface DetailRow {
  label: string;
  value: string;
  ok?: boolean;
}

/** One step of the workflow tile: done (date known), current (where the report sits), todo. */
interface WorkflowStep {
  label: string;
  date: string | null;
  state: 'done' | 'current' | 'todo';
}

/** Position of each status on the F.08 path; AMENDMENT_REQUESTED sits back at the draft step. */
const WORKFLOW_POSITION: Record<PlReportStatus, number> = {
  DRAFT:               0,
  AMENDMENT_REQUESTED: 0,
  SUBMITTED:           1,
  CD_ENDORSED:         2,
  GROUP_ACCEPTED:      3,
  SUPERSEDED:          3,
};

/** Cost buckets of the snapshotted `PlPeriodDto`, in the order the cost chart draws them. */
const COST_BUCKETS: { key: keyof PlPeriodDto; label: string }[] = [
  { key: 'costBillableSalaries',       label: 'REPORTING.DETAIL.OVERVIEW.COST.SALARIES' },
  { key: 'costSubconsultants',         label: 'REPORTING.DETAIL.OVERVIEW.COST.SUBCONSULTANTS' },
  { key: 'costOpex',                   label: 'REPORTING.DETAIL.OVERVIEW.COST.OPEX' },
  { key: 'costSoftwareSubscriptions',  label: 'REPORTING.DETAIL.OVERVIEW.COST.SOFTWARE' },
  { key: 'costIntercompany',           label: 'REPORTING.DETAIL.OVERVIEW.COST.INTERCOMPANY' },
  { key: 'costCommunicationMarketing', label: 'REPORTING.DETAIL.OVERVIEW.COST.MARKETING' },
];

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
import { PageGuideComponent } from '../../../shared/guide/page-guide.component';
import type { GuideStep } from '../../../shared/guide/page-guide.types';

/** Guide de la page — `target` = un `data-guide` du gabarit, `tab` = l'onglet à ouvrir. */
const step = (key: string, icon: string, target?: string, tab?: string): GuideStep => ({
  icon, titleKey: `GUIDE.REPORT_DETAIL.${key}_TITLE`, textKey: `GUIDE.REPORT_DETAIL.${key}_TEXT`, target, tab,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO', 'summarize'),
  step('HEADER', 'label', 'report-header'),
  step('IDENTITY', 'badge', 'report-identity'),
  step('ACTIONS', 'send', 'report-actions'),
  step('AMEND', 'undo', 'report-actions'),
  step('EXPORTS', 'download', 'report-actions'),
  step('KPIS', 'insights', 'report-kpis'),
  step('TABS', 'tab', 'report-tabs'),
  step('OVERVIEW', 'dashboard', 'report-panel', 'overview'),
  step('RECAP', 'table_chart', 'report-panel', 'recap'),
  step('COMMENTS', 'rate_review', 'report-panel', 'commentaires'),
  step('TREASURY', 'account_balance', 'report-panel', 'tresorerie'),
  step('END', 'help'),
];

@Component({
  selector: 'app-report-detail',
  imports: [
    TranslatePipe,
    PageComponent, PageHeaderComponent, SectionCardComponent, ButtonComponent, FormFieldComponent,
    DataTableComponent, DafCellDirective, RadioGroupComponent,
    MetricCardComponent, TabsComponent, ProgressBarComponent, BarChartComponent, AccordionCardComponent,
    SearchToolbarComponent,
    PageGuideComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './report-detail.component.html',
  /*
   * Same split layout as the affaire and supplier detail pages (30 % sticky details panel +
   * 70 % KPIs/tabs). Component styles, not Tailwind classes, for the reason those two pages
   * give: a remote's styles.css only holds the classes Tailwind already saw, and these sizes
   * (9 px micro-labels, 12.5 px values) exist nowhere else. Class names and values are kept
   * identical to `supplier-detail.component.ts` so the three panels read the same.
   */
  styles: [`
    /* ── Les deux colonnes ─────────────────────────────────────────────────── */
    .detail-split {
      display:     flex;
      flex-wrap:   wrap;
      gap:         2rem;
      align-items: flex-start;
    }
    .detail-aside {
      flex:      0 1 30%;
      min-width: 320px;
      max-width: 420px;
    }
    .detail-main {
      flex:           1 1 480px;
      min-width:      0;
      display:        flex;
      flex-direction: column;
      gap:            1.5rem;
    }

    /* ── Rangées de cartes : des grilles, pas du flex-wrap ─────────────────── */
    .kpi-row, .tile-row {
      display:     grid;
      gap:         1.5rem;
      align-items: stretch;
    }
    .kpi-row  { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
    .tile-row { grid-template-columns: repeat(auto-fit, minmax(215px, 1fr)); }
    .kpi-cell, .tile-cell {
      display:        flex;
      flex-direction: column;
      min-width:      0;
    }
    .kpi-cell  { min-height: 118px; }
    .tile-cell { min-height: 210px; height: auto; }

    @media (max-width: 1400px) {
      .detail-split { gap: 1.5rem; }
      .detail-aside { min-width: 300px; max-width: 360px; }
    }
    @media (max-width: 1150px) {
      .detail-aside {
        flex:      1 1 100%;
        max-width: none;
        min-width: 0;
      }
      .detail-aside > div { position: static !important; }
    }
    @media (max-width: 640px) {
      .kpi-row, .tile-row { gap: 1rem; }
    }

    /* ══ PANNEAU DE DÉTAILS (colonne gauche) — mêmes classes que la fiche fournisseur ══ */
    .dp { display: flex; flex-direction: column; gap: 12px; }
    .dp-card { display: flex; flex-direction: column; }
    .dp-block {
      display:        flex;
      flex-direction: column;
      gap:            8px;
      padding:        14px 16px;
    }
    .dp-label {
      margin:         0;
      font-size:      9px;
      font-weight:    700;
      letter-spacing: .14em;
      text-transform: uppercase;
      color:          var(--color-on-surface-variant, #44474c);
    }
    .dp-rule {
      height:     1px;
      background: var(--color-outline-variant, #c5c6cd);
      opacity:    .55;
    }
    .dp-rule--major { height: 2px; opacity: .4; }
    .dp-rows { margin: 0; }
    /* No rule between key/value rows (unlike the supplier panel): only the major rule
       between the "Rapport" and "Workflow" blocks separates anything here. */
    .dp-row {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             12px;
      padding:         6px 0;
    }
    .dp-row--last { padding-bottom: 0; }
    .dp-row__key {
      margin:    0;
      font-size: 12px;
      color:     var(--color-on-surface-variant, #44474c);
    }
    .dp-row__val {
      margin:      0;
      font-size:   12.5px;
      font-weight: 600;
      color:       var(--color-on-surface, #191c1e);
      text-align:  right;
    }
    .dp-flag {
      display:     inline-flex;
      align-items: center;
      gap:         6px;
      font-weight: 600;
      color:       var(--color-on-surface-variant, #44474c);
    }
    .dp-flag__dot {
      width:         6px;
      height:        6px;
      border-radius: 50%;
      background:    var(--color-outline, #75777d);
      flex-shrink:   0;
    }
    .dp-flag--ok               { color: var(--color-tertiary, #00c1ad); }
    .dp-flag--ok .dp-flag__dot { background: var(--color-tertiary, #00c1ad); }

    /* ══ Tuile « Du CA à l'EBITDA » : une ligne par palier ══ */
    .wf-row {
      display:         flex;
      align-items:     baseline;
      justify-content: space-between;
      gap:             12px;
      font-size:       12.5px;
      color:           var(--color-on-surface-variant, #44474c);
    }
    .wf-row__val { font-weight: 600; color: var(--color-on-surface, #191c1e); }
    .wf-row--total {
      padding-top: 8px;
      border-top:  1px solid var(--color-outline-variant, #c5c6cd);
      font-weight: 700;
      color:       var(--color-on-surface, #191c1e);
    }
    .wf-row--total .wf-row__val { font-size: 16px; font-weight: 800; }
    .wf-row--neg .wf-row__val   { color: var(--color-danger, #ba1a1a); }

    /* ══ Tuile « Avancement » : étapes verticales reliées par un trait ══ */
    .step {
      position:    relative;
      display:     flex;
      gap:         10px;
      align-items: flex-start;
      padding-bottom: 10px;
    }
    .step:last-child { padding-bottom: 0; }
    .step::before {
      content:    '';
      position:   absolute;
      left:       5px;
      top:        14px;
      bottom:     -2px;
      width:      2px;
      background: var(--color-outline-variant, #c5c6cd);
    }
    .step:last-child::before { display: none; }
    .step--done::before { background: var(--color-tertiary, #00c1ad); }
    .step__dot {
      position:      relative;
      z-index:       1;
      width:         12px;
      height:        12px;
      margin-top:    2px;
      border-radius: 50%;
      border:        2px solid var(--color-outline, #75777d);
      background:    var(--color-surface, #fff);
      flex-shrink:   0;
    }
    .step--done .step__dot    { border-color: var(--color-tertiary, #00c1ad); background: var(--color-tertiary, #00c1ad); }
    .step--current .step__dot { border-color: var(--color-tertiary, #00c1ad); box-shadow: 0 0 0 3px rgba(0, 193, 173, .2); }
    .step__label { font-size: 12.5px; font-weight: 600; color: var(--color-on-surface, #191c1e); }
    .step--todo .step__label { font-weight: 500; color: var(--color-on-surface-variant, #44474c); }
    .step__date  { font-size: 11px; color: var(--color-on-surface-variant, #44474c); }
  `],
})
export class ReportDetailComponent implements OnInit {

  readonly guideSteps = GUIDE_STEPS;

  /** L'onglet de l'utilisateur, rendu à la fermeture du guide (qui ouvre ceux qu'il explique). */
  private tabBeforeGuide: string | null = null;

  onGuideTab(tab: string): void {
    this.tabBeforeGuide ??= this.activeTab();
    this.activeTab.set(tab as never);
  }

  onGuideClosed(): void {
    if (this.tabBeforeGuide) this.activeTab.set(this.tabBeforeGuide as never);
    this.tabBeforeGuide = null;
  }
  private readonly reportSvc     = inject(PlReportService);
  private readonly periodSvc     = inject(PlPeriodService);
  private readonly commentarySvc = inject(VarianceCommentaryService);
  private readonly translate     = inject(TranslateService);
  private readonly currency      = inject(DisplayCurrencyPipe);
  private readonly modals        = inject(ModalService);
  private readonly userStore     = inject(UserStore);
  private readonly clientSvc     = inject(ClientService);
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

  // ── Cash position (Receivables / Missing Cash) -- lazy-loaded when the tab first opens ─────
  receivablesLoaded    = signal(false);
  isLoadingReceivables = signal(false);
  receivables          = signal<ReceivableLineDto[]>([]);

  missingCashLoaded    = signal(false);
  isLoadingMissingCash = signal(false);
  missingCash          = signal<MissingCashRowDto[]>([]);

  /** Country reference list — only to name the report's `paysId` in the header and panel. */
  private readonly paysList = signal<PaysRefDto[]>([]);

  readonly canManageCommentary = computed(() => this.userStore.hasPermission('FACT_MANAGE_PL_REPORT'));

  // ── Lifecycle ────────────────────────────────────────────────────────────
  /** See class doc: an `effect()`, not just `ngOnInit`, so navigating to a new report id
   *  (OPTION_1_VERSIONED reopen) on the same route reloads without a fresh component instance. */
  constructor() {
    effect(() => {
      const rawId = this.id();
      const numId = Number(rawId);
      // id 0 is a valid identity value (reseeded dev tables) — only skip a missing/non-numeric id.
      if (rawId != null && rawId !== '' && !Number.isNaN(numId)) this.load(numId);
    });

    // Treasury tab: the shown sub-part (receivables / missing cash) loads the first time it
    // is displayed, once the period (and so its paysId) is known — replaces the old
    // per-table "Afficher" buttons.
    effect(() => {
      if (this.activeTab() !== 'tresorerie' || !this.period()) return;
      const sub = this.cashTab();
      untracked(() => sub === 'receivables' ? this.loadReceivables() : this.loadMissingCash());
    });
  }

  ngOnInit(): void {
    // The constructor's effect() handles the report load (see there). Only the country
    // names are fetched here — a failure just leaves the raw id out of the header.
    this.clientSvc.getPays().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next:  pays => this.paysList.set(pays),
      error: () => this.paysList.set([]),
    });
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
        this.resetSectionAccordions();
        this.resetLineAccordions();
      },
      error: () => {
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.SECONDARY_LOAD_ERROR'));
      },
    });
  }

  /** Same guard as the constructor's effect: id 0 is a valid identity value, so a plain
   *  truthiness test (`if (numId)`) silently skipped the reload after every action on it. */
  refresh(): void {
    const rawId = this.id();
    const numId = Number(rawId);
    if (rawId != null && rawId !== '' && !Number.isNaN(numId)) this.load(numId);
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

  /** "Turquie (TR)" — falls back to "#id" until (or if never) the country list loads. */
  readonly paysName = computed(() => {
    const r = this.report();
    if (!r) return '';
    const p = this.paysList().find(x => x.id === r.paysId);
    return p ? `${paysLabel(p, this.translate.currentLang())} (${p.isoCode})` : `#${r.paysId}`;
  });

  /** The h1 of the left column: the period alone — "Rapport P&L" is in the breadcrumb already. */
  readonly pageTitle = computed(() => {
    this.translate.currentLang();
    return this.periodLabel(this.period()) || this.translate.instant('REPORTING.DETAIL.TITLE_PREFIX');
  });

  readonly headerSubtitle = computed(() => {
    const r = this.report();
    if (!r) return '';
    this.translate.currentLang();
    return `${this.paysName()} · ${this.translate.instant('REPORTING.DETAIL.VERSION', { n: r.version })}`;
  });

  // ── Left details panel ───────────────────────────────────────────────────

  readonly reportRows = computed<DetailRow[]>(() => {
    const r = this.report();
    if (!r) return [];
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const p = this.period();
    return [
      { label: t('REPORTING.DETAIL.PANEL.PAYS'),          value: this.paysName() },
      { label: t('REPORTING.DETAIL.PANEL.PERIOD'),        value: this.periodLabel(p) || '—' },
      { label: t('REPORTING.DETAIL.PANEL.PERIOD_STATUS'), value: p ? t(`REPORTING.PERIOD_STATUS.${p.status}`) : '—',
        ok: p?.status === 'APPROVED' },
      { label: t('REPORTING.DETAIL.PANEL.VERSION'),       value: String(r.version) },
      { label: t('REPORTING.DETAIL.PANEL.CREATED'),       value: this.formatDate(r.createdAt) },
    ];
  });

  /** Who-did-what dates of the F.08 path. A missing date reads "En attente", not a dash:
   *  it is a step still ahead, not an unknown value. */
  readonly workflowRows = computed<DetailRow[]>(() => {
    const r = this.report();
    if (!r) return [];
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const row = (key: string, at: string | null): DetailRow => ({
      label: t(key),
      value: at ? this.formatDate(at) : t('REPORTING.DETAIL.PANEL.PENDING'),
      ok:    at != null,
    });
    return [
      row('REPORTING.DETAIL.PANEL.SUBMITTED', r.submittedAt),
      row('REPORTING.DETAIL.PANEL.ENDORSED',  r.cdEndorsedAt),
      row('REPORTING.DETAIL.PANEL.ACCEPTED',  r.groupAcceptedAt),
    ];
  });

  /** Reopen/supersession notes, shown only when the backend recorded one. */
  readonly reopenNote = computed(() => {
    const r = this.report();
    return r?.reopenRationale || r?.supersessionReason || null;
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
    // Sorted on the raw figures (`_source`), not on the formatted strings — same pattern as
    // the affaire page's TS table.
    const src = (row: TableRow) => row['_source'] as PlReportLineDto;
    return [
      { key: 'label',    label: t('REPORTING.DETAIL.RECAP.LINE'),     type: 'text', sortable: true,
        sortAccessor: row => src(row).sortOrder },
      { key: 'amount',   label: t('REPORTING.DETAIL.RECAP.ACTUAL'),   type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).amountLocal },
      { key: 'budget',   label: t('REPORTING.DETAIL.RECAP.BUDGET'),   type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).budgetAmountLocal },
      { key: 'variance', label: t('REPORTING.DETAIL.RECAP.VARIANCE'), type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).variancePct },
    ];
  });

  // ── Toolbars (search + filter panel) of the three tables ─────────────────

  /** Panel labels shared by the three toolbars. Each table then adds its own
   *  `initialValues`: `daf-filter` only seeds itself on creation, and every toolbar is
   *  recreated when its tab/sub-tab comes back (`@if`) — without them, coming back showed an
   *  empty panel while the filter was still applied (same reason as the affaire page). */
  private readonly filterConfigBase = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title:        t('REPORTING.FILTER.FILTERS'),
      applyLabel:   t('REPORTING.FILTER.APPLY'),
      cancelLabel:  t('REPORTING.DETAIL.CANCEL'),
      resetLabel:   t('REPORTING.FILTER.RESET'),
      triggerLabel: t('REPORTING.FILTER.FILTERS'),
    };
  });

  /** The table's empty text: "no line matches" once a search/filter hides every row, the
   *  table's own empty message otherwise. */
  private emptyText(total: number, shown: number, emptyKey: string): string {
    return total > 0 && shown === 0
      ? this.translate.instant('REPORTING.DETAIL.TOOLBAR.NO_MATCH')
      : this.translate.instant(emptyKey);
  }

  // Recap — search on the line label, filter on the variance sign and the actual amount.
  recapSearch    = signal('');
  recapVariance  = signal<VarianceFilter>('');
  recapAmountMin = signal('');
  recapAmountMax = signal('');

  readonly recapFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name:    'variance',
      label:   t('REPORTING.DETAIL.TOOLBAR.VARIANCE'),
      type:    'select',
      options: [
        { value: 'over',      label: t('REPORTING.DETAIL.TOOLBAR.VARIANCE_OVER') },
        { value: 'under',     label: t('REPORTING.DETAIL.TOOLBAR.VARIANCE_UNDER') },
        { value: 'no-budget', label: t('REPORTING.DETAIL.TOOLBAR.NO_BUDGET') },
      ],
    }, {
      name: 'amountMin', label: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_MIN'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name: 'amountMax', label: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_MAX'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }];
  });

  readonly recapFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfigBase(),
    initialValues: {
      variance:  this.recapVariance() ? [this.recapVariance()] : [],
      amountMin: this.recapAmountMin(),
      amountMax: this.recapAmountMax(),
    },
  }));

  onRecapFilterApply(result: FilterResult): void {
    this.recapVariance.set(asFilterValue(result, 'variance') as VarianceFilter);
    this.recapAmountMin.set(asText(result, 'amountMin'));
    this.recapAmountMax.set(asText(result, 'amountMax'));
  }

  onRecapFilterReset(): void {
    this.recapVariance.set('');
    this.recapAmountMin.set('');
    this.recapAmountMax.set('');
  }

  private readonly filteredLines = computed(() => {
    const q = this.recapSearch().trim().toLowerCase(), variance = this.recapVariance();
    const min = parseAmount(this.recapAmountMin()), max = parseAmount(this.recapAmountMax());
    return this.sortedLines().filter(l =>
      (variance !== 'over'      || (l.variancePct ?? 0) > 0) &&
      (variance !== 'under'     || (l.variancePct ?? 0) < 0) &&
      (variance !== 'no-budget' || l.budgetAmountLocal == null) &&
      inAmountRange(l.amountLocal, min, max) &&
      (!q || `${l.catalogueLineLabelFr} ${l.catalogueLineCode}`.toLowerCase().includes(q)));
  });

  readonly recapRows = computed<TableRow[]>(() => this.filteredLines().map(line => ({
    id:       line.id,
    label:    line.catalogueLineLabelFr,
    amount:   this.currency.transform(line.amountLocal, 'TND'),
    budget:   line.budgetAmountLocal != null ? this.currency.transform(line.budgetAmountLocal, 'TND') : '—',
    variance: this.formatVariancePct(line.variancePct),
    _source:  line,
  })));

  /** Same table setup as the affaire page's TS tab: `tableTools` brings resizable columns
   *  and rows, the column picker, the reset button and a stable `rowId`. */
  readonly recapConfig = computed<TableConfig>(() => ({
    showHeader:   false,
    hoverable:    true,
    loading:      this.loading(),
    skeletonRows: 13,
    emptyMessage: this.emptyText(this.lines().length, this.filteredLines().length, 'REPORTING.EMPTY'),
    ...tableTools(this.translate),
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

  readonly ebitdaNegative = computed(() => (this.period()?.ebitda ?? 0) < 0);

  /** 4 `daf-metric-card` tiles -- built only from fields confirmed real on `PlPeriodDto` today,
   *  reusing the 4 display computeds just above verbatim (same currency/format logic). */
  readonly kpiTiles = computed<KpiTile[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const neg = this.ebitdaNegative();
    return [
      { label: t('REPORTING.WATERFALL.GROSS_REVENUE_2'), value: this.grossRevenue2Display(), delta: null,
        options: { icon: 'payments', iconColor: 'text-primary', iconBg: 'bg-primary/10' } },
      { label: t('REPORTING.WATERFALL.NET_REVENUE'), value: this.netRevenueDisplay(), delta: null,
        options: { icon: 'trending_up', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' } },
      { label: t('REPORTING.TABLE.EBITDA'), value: this.ebitdaDisplay(), delta: null,
        options: neg
          ? { icon: 'account_balance_wallet', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
          : { icon: 'account_balance_wallet', iconColor: 'text-teal', iconBg: 'bg-teal/10' } },
      { label: t('REPORTING.WATERFALL.EBITDA_PCT'), value: this.ebitdaPctDisplay(), delta: null,
        options: neg
          ? { icon: 'percent', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger' }
          : { icon: 'percent', iconColor: 'text-teal', iconBg: 'bg-teal/10' } },
    ];
  });

  // ── Tabs — the active one lives in `?tab=` (same as the affaire / supplier pages) ──

  readonly tabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // A zero count is OMITTED, not `null`: `null` tells daf-tabs "a number is on its way" and
    // keeps the badge's width reserved, which left a blank gap after "Récap P&L" on a report
    // without lines. Both lists arrive with the report, so there is no shift to prevent.
    const count = (n: number) => (n ? { count: n } : {});
    return [
      { id: 'overview',     label: t('REPORTING.DETAIL.TABS.OVERVIEW') },
      { id: 'recap',        label: t('REPORTING.DETAIL.TABS.RECAP'),        ...count(this.lines().length) },
      { id: 'commentaires', label: t('REPORTING.DETAIL.TABS.COMMENTARIES'), ...count(this.commentaries().length) },
      { id: 'tresorerie',   label: t('REPORTING.DETAIL.TABS.TREASURY') },
    ];
  });

  /** `tabParam` and not a bare signal: a link to one tab can be shared and survives a reload. */
  activeTab = tabParam<ReportTab>(computed(() => this.tabs().map(t => t.id as ReportTab)), 'overview');

  /** The two parts of the treasury tab, as pill sub-tabs. Own URL key (`?cash=`) so it does
   *  not fight the main `?tab=` bar for the same parameter. */
  readonly cashTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'receivables',  icon: 'request_quote', label: t('REPORTING.DETAIL.CASH.RECEIVABLES.TITLE'),
        count: this.receivablesLoaded() ? this.receivables().length : null },
      { id: 'missing-cash', icon: 'money_off',     label: t('REPORTING.DETAIL.CASH.MISSING_CASH.TITLE'),
        count: this.missingCashLoaded() ? this.missingCash().length : null },
    ];
  });

  cashTab = tabParam<CashTab>(['receivables', 'missing-cash'], 'receivables', { param: 'cash' });

  /** The two parts of the commentary tab, same pill sub-tabs as the treasury one (`?comment=`).
   *  Both lists are already loaded with the report — switching costs no call. */
  readonly commentaryTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Zero → omitted, not `null` (see `tabs`): no reserved blank space.
    const count = (n: number) => (n ? { count: n } : {});
    return [
      { id: 'lines',    icon: 'format_list_bulleted', label: t('REPORTING.DETAIL.COMMENTARY.TITLE'),
        ...count(this.lineCommentaryVms().filter(vm => vm.commentary).length) },
      { id: 'sections', icon: 'summarize',            label: t('REPORTING.DETAIL.SECTION.TITLE'),
        ...count(this.sectionCommentaries().length) },
    ];
  });

  commentaryTab = tabParam<CommentaryTab>(['lines', 'sections'], 'lines', { param: 'comment' });

  // ── Overview tab ─────────────────────────────────────────────────────────

  readonly workflowSteps = computed<WorkflowStep[]>(() => {
    const r = this.report();
    if (!r) return [];
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const pos = WORKFLOW_POSITION[r.status] ?? 0;
    const accepted = r.status === 'GROUP_ACCEPTED' || r.status === 'SUPERSEDED';
    const steps: [string, string | null][] = [
      ['REPORTING.DETAIL.OVERVIEW.STEP.DRAFT',    r.createdAt],
      ['REPORTING.DETAIL.OVERVIEW.STEP.SUBMITTED', r.submittedAt],
      ['REPORTING.DETAIL.OVERVIEW.STEP.ENDORSED',  r.cdEndorsedAt],
      ['REPORTING.DETAIL.OVERVIEW.STEP.ACCEPTED',  r.groupAcceptedAt],
    ];
    return steps.map(([key, at], i) => ({
      label: t(key),
      date:  at && i <= pos ? this.formatDate(at) : null,
      // The last step is "done", not "current", once Group accepted: nothing is pending.
      state: i < pos || (accepted && i === pos) ? 'done' : i === pos ? 'current' : 'todo',
    }));
  });

  readonly amendmentRequested = computed(() => this.status() === 'AMENDMENT_REQUESTED');

  /** Commentaries with some narrative written, out of all generated ones. */
  readonly commentaryWritten = computed(() =>
    this.commentaries().filter(c => (c.narrative ?? '').trim().length > 0).length);

  readonly commentaryPct = computed(() => {
    const total = this.commentaries().length;
    return total ? Math.round((this.commentaryWritten() / total) * 100) : 0;
  });

  readonly commentaryBarOptions = computed<ProgressBarOptions>(() => ({
    variant: this.commentaryPct() === 100 ? 'teal' : 'warning',
    size:    'sm',
  }));

  readonly costBars = computed<BarChartBar[]>(() => {
    const p = this.period();
    if (!p) return [];
    this.translate.currentLang();
    return COST_BUCKETS.map(b => {
      const value = Number(p[b.key] ?? 0);
      return {
        label:      this.translate.instant(b.label),
        value,
        valueLabel: this.currency.transform(value, 'TND'),
      };
    });
  });

  readonly costChartOptions = computed<BarChartOptions>(() => {
    this.translate.currentLang();
    return {
      orientation:  'horizontal',
      variant:      'tertiary',
      showAxis:     false,
      emptyMessage: this.translate.instant('REPORTING.DETAIL.OVERVIEW.COST_EMPTY'),
      ariaLabel:    this.translate.instant('REPORTING.DETAIL.OVERVIEW.COST_TITLE'),
    };
  });

  readonly costTotalDisplay = computed(() =>
    this.currency.transform(this.period()?.totalOperatingCost ?? null, 'TND'));

  readonly hasCosts = computed(() => this.costBars().some(b => b.value !== 0));

  // ── Variance commentary (per-line) ──────────────────────────────────────

  readonly lineCommentaryVms = computed<LineCommentaryVm[]>(() => {
    const list = this.commentaries();
    return this.sortedLines().map(line => ({
      line,
      commentary: list.find(c => c.catalogueLineId === line.catalogueLineId) ?? null,
    }));
  });

  /** By default only the lines that actually carry a commentary — a catalogue line without
   *  one is just "rien à rédiger", repeated up to 17 times. */
  readonly showAllLines = signal(false);

  readonly visibleLineCommentaryVms = computed(() =>
    this.showAllLines() ? this.lineCommentaryVms() : this.lineCommentaryVms().filter(vm => vm.commentary));

  readonly hiddenLineCount = computed(() =>
    this.lineCommentaryVms().length - this.lineCommentaryVms().filter(vm => vm.commentary).length);

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

  /** Open/closed state of each section's accordion card, keyed by commentary id. */
  private readonly sectionOpen = signal<Record<number, boolean>>({});

  /**
   * On each (re)load, open only the first section still to write — or none when all four
   * are written. Decided once per load and then left to the user: deriving it live would
   * close the card just saved and spring the next one open under the cursor.
   */
  private resetSectionAccordions(): void {
    const firstEmpty = this.sectionCommentaries().find(c => !(c.narrative ?? '').trim());
    this.sectionOpen.set(firstEmpty ? { [firstEmpty.id]: true } : {});
  }

  isSectionOpen(c: VarianceCommentaryDto): boolean {
    return this.sectionOpen()[c.id] ?? false;
  }

  onSectionOpenChange(c: VarianceCommentaryDto, open: boolean): void {
    this.sectionOpen.update(map => ({ ...map, [c.id]: open }));
  }

  /**
   * The card header: section name, the start of the narrative as sub-line (so a closed card
   * still says what is written), and a status label that reads from the closed card too —
   * "Modifié" (unsaved edit) > "En relecture" > "Brouillon" > "À rédiger" (empty).
   *
   * No `state`: it would tint the stripe, icon disc and pill (amber/green), and these cards
   * stay in the lib's neutral look — same choice as the roles admin's accordion. The label
   * alone carries the status.
   */
  sectionAccordionOptions(c: VarianceCommentaryDto): AccordionCardOptions {
    return this.commentaryAccordionOptions(
      this.sectionLabel(c.sectionType), c.sectionType ? SECTION_ICON[c.sectionType] : 'notes', c);
  }

  /** Shared by the section cards above and the per-line cards (`lineAccordionOptions`). */
  private commentaryAccordionOptions(title: string, icon: string, c: VarianceCommentaryDto): AccordionCardOptions {
    const t = (k: string) => this.translate.instant(k);
    const text = this.draftFor(c).trim();
    const preview = text.length > SECTION_PREVIEW_LENGTH
      ? `${text.slice(0, SECTION_PREVIEW_LENGTH).trimEnd()}…`
      : text;
    const statusLabel =
      this.isDirty(c)               ? t('REPORTING.DETAIL.SECTION.MODIFIED')
      : !text                       ? t('REPORTING.DETAIL.SECTION.TO_WRITE')
      : c.status === 'UNDER_REVIEW' ? t('REPORTING.DETAIL.COMMENTARY.STATUS.UNDER_REVIEW')
      :                               t('REPORTING.DETAIL.COMMENTARY.STATUS.DRAFT');
    return { title, subtitle: preview || undefined, icon, statusLabel };
  }

  // ── Per-line commentary accordions — same cards, same neutral look ──────

  /** Open/closed state of each catalogue line's card, keyed by `PlReportLineDto.id`. */
  private readonly lineOpen = signal<Record<number, boolean>>({});

  /** Same rule as `resetSectionAccordions`: on each load, open only the first line whose
   *  commentary is still empty. */
  private resetLineAccordions(): void {
    const firstEmpty = this.lineCommentaryVms()
      .find(vm => vm.commentary && !(vm.commentary.narrative ?? '').trim());
    this.lineOpen.set(firstEmpty ? { [firstEmpty.line.id]: true } : {});
  }

  isLineOpen(vm: LineCommentaryVm): boolean {
    return this.lineOpen()[vm.line.id] ?? false;
  }

  onLineOpenChange(vm: LineCommentaryVm, open: boolean): void {
    this.lineOpen.update(map => ({ ...map, [vm.line.id]: open }));
  }

  /** A line without a generated commentary (only listed with "Afficher toutes les lignes")
   *  has nothing to edit: its card is disabled and says so. */
  lineAccordionOptions(vm: LineCommentaryVm): AccordionCardOptions {
    const title = vm.line.catalogueLineLabelFr;
    if (!vm.commentary) {
      return { title, icon: 'notes', disabled: true,
               statusLabel: this.translate.instant('REPORTING.DETAIL.COMMENTARY.NO_COMMENTARY') };
    }
    return this.commentaryAccordionOptions(title, 'notes', vm.commentary);
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

  /**
   * The quick-actions card's single large button: the next step of the workflow the viewer
   * may take. The three statuses are mutually exclusive (DRAFT/AMENDMENT → submit,
   * SUBMITTED → endorse, CD_ENDORSED → accept), so at most one ever applies.
   */
  readonly primaryAction = computed<{ run: () => void; options: ButtonOptions } | null>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const base = { variant: 'primary' as const, size: 'lg' as const, fullWidth: true,
                   loading: this.actionSaving(), disabled: this.actionSaving() };
    if (this.canSubmit()) {
      return { run: () => this.submit(),  options: { ...base, iconStart: 'send',         label: t('REPORTING.DETAIL.ACTIONS.SUBMIT') } };
    }
    if (this.canEndorse()) {
      return { run: () => this.endorse(), options: { ...base, iconStart: 'verified',     label: t('REPORTING.DETAIL.ACTIONS.ENDORSE') } };
    }
    if (this.canAccept()) {
      return { run: () => this.accept(),  options: { ...base, iconStart: 'check_circle', label: t('REPORTING.DETAIL.ACTIONS.ACCEPT') } };
    }
    return null;
  });

  readonly amendmentButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return { variant: 'secondary', size: 'sm', fullWidth: true, iconStart: 'undo', disabled: this.actionSaving(),
             label: this.translate.instant('REPORTING.DETAIL.ACTIONS.REQUEST_AMENDMENT_SHORT') };
  });

  readonly reopenButtonOptions = computed<ButtonOptions>(() => {
    this.translate.currentLang();
    return { variant: 'secondary', size: 'sm', fullWidth: true, iconStart: 'lock_open', disabled: this.actionSaving(),
             label: this.translate.instant('REPORTING.DETAIL.ACTIONS.REOPEN') };
  });

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
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
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
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
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
   *  translatable text -- map it to an i18n key the same way the accordion status labels map a status
   *  enum, falling back to the raw string (shown as-is) for any value not in the map. */
  private ageingBadge(category: string): BadgeCell {
    const meta = AGEING_BADGE[category];
    return {
      label:   meta ? this.translate.instant(`REPORTING.DETAIL.CASH.AGEING.${meta.key}`) : category,
      options: { variant: meta?.variant ?? 'neutral', dot: true, size: 'sm' },
    };
  }

  /** Loaded once, the first time the "Créances clients" sub-tab is shown (see the
   *  constructor's effect). A failed load stays unloaded, so showing it again retries. */
  private loadReceivables(): void {
    const paysId = this.period()?.paysId;
    if (paysId == null || this.receivablesLoaded() || this.isLoadingReceivables()) return;
    this.isLoadingReceivables.set(true);
    this.reportSvc.getReceivables(paysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.receivables.set(data);
        this.isLoadingReceivables.set(false);
        this.receivablesLoaded.set(true);
      },
      error: () => {
        this.isLoadingReceivables.set(false);
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  /** Same as `loadReceivables`, for the "Cash manquant" sub-tab. */
  private loadMissingCash(): void {
    const paysId = this.period()?.paysId;
    if (paysId == null || this.missingCashLoaded() || this.isLoadingMissingCash()) return;
    this.isLoadingMissingCash.set(true);
    this.reportSvc.getMissingCash(paysId).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: data => {
        this.missingCash.set(data);
        this.isLoadingMissingCash.set(false);
        this.missingCashLoaded.set(true);
      },
      error: () => {
        this.isLoadingMissingCash.set(false);
        this.actionError.set(this.translate.instant('REPORTING.DETAIL.ACTION_ERROR'));
      },
    });
  }

  readonly receivablesColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Raw-value sort keys (`_source`): the displayed amount/date/days are formatted strings,
    // which sorted alphabetically ("10" before "9").
    const src = (row: TableRow) => row['_source'] as ReceivableLineDto;
    return [
      { key: 'invoiceNumber',  label: t('REPORTING.DETAIL.CASH.RECEIVABLES.INVOICE'),      type: 'text', sortable: true },
      { key: 'clientName',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.CLIENT'),       type: 'text', sortable: true },
      { key: 'clientType',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.CLIENT_TYPE'),  type: 'text', sortable: true },
      { key: 'amountIncTax',   label: t('REPORTING.DETAIL.CASH.RECEIVABLES.AMOUNT'),       type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).amountIncTax },
      { key: 'dueDate',        label: t('REPORTING.DETAIL.CASH.RECEIVABLES.DUE_DATE'),     type: 'text', sortable: true,
        sortAccessor: row => src(row).dueDate },
      { key: 'daysAgeing',     label: t('REPORTING.DETAIL.CASH.RECEIVABLES.DAYS_AGEING'),  type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).daysAgeing },
      { key: 'ageingCategory', label: t('REPORTING.DETAIL.CASH.RECEIVABLES.AGEING'),       type: 'badge', sortable: true,
        sortAccessor: row => src(row).daysAgeing },
    ];
  });

  // Receivables — search on invoice n° / client, filter on ageing, client type, due date, amount.
  receivablesSearch     = signal('');
  receivablesAgeing     = signal('');
  receivablesClientType = signal('');
  receivablesDueRange   = signal<Date[] | null>(null);
  receivablesAmountMin  = signal('');
  receivablesAmountMax  = signal('');

  readonly receivablesFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const present = new Set(this.receivables().map(r => r.ageingCategory as string));
    return [{
      name:    'ageing',
      label:   t('REPORTING.DETAIL.TOOLBAR.AGEING'),
      type:    'select',
      // Backend order (youngest → oldest), limited to the buckets actually present.
      options: Object.keys(AGEING_BADGE).filter(k => present.has(k))
        .map(value => ({ value, label: this.ageingBadge(value).label })),
    }, {
      name:    'clientType',
      label:   t('REPORTING.DETAIL.CASH.RECEIVABLES.CLIENT_TYPE'),
      type:    'select',
      options: [...new Set(this.receivables().map(r => r.clientType).filter((s): s is string => !!s))]
        .sort().map(value => ({ value, label: value })),
    }, {
      name:  'dueRange',
      label: t('REPORTING.DETAIL.TOOLBAR.DUE_PERIOD'),
      type:  'daterange',
    }, {
      name: 'amountMin', label: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_MIN'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name: 'amountMax', label: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_MAX'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }];
  });

  readonly receivablesFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfigBase(),
    initialValues: {
      ageing:     this.receivablesAgeing()     ? [this.receivablesAgeing()]     : [],
      clientType: this.receivablesClientType() ? [this.receivablesClientType()] : [],
      dueRange:   this.receivablesDueRange(),
      amountMin:  this.receivablesAmountMin(),
      amountMax:  this.receivablesAmountMax(),
    },
  }));

  onReceivablesFilterApply(result: FilterResult): void {
    this.receivablesAgeing.set(asFilterValue(result, 'ageing'));
    this.receivablesClientType.set(asFilterValue(result, 'clientType'));
    this.receivablesDueRange.set(asDateRange(result, 'dueRange'));
    this.receivablesAmountMin.set(asText(result, 'amountMin'));
    this.receivablesAmountMax.set(asText(result, 'amountMax'));
  }

  onReceivablesFilterReset(): void {
    this.receivablesAgeing.set('');
    this.receivablesClientType.set('');
    this.receivablesDueRange.set(null);
    this.receivablesAmountMin.set('');
    this.receivablesAmountMax.set('');
  }

  private readonly filteredReceivables = computed(() => {
    const q = this.receivablesSearch().trim().toLowerCase();
    const ageing = this.receivablesAgeing(), clientType = this.receivablesClientType();
    const range = this.receivablesDueRange();
    const min = parseAmount(this.receivablesAmountMin()), max = parseAmount(this.receivablesAmountMax());
    return this.receivables().filter(r =>
      (!ageing     || r.ageingCategory === ageing) &&
      (!clientType || r.clientType === clientType) &&
      inDayRange(r.dueDate, range) &&
      inAmountRange(r.amountIncTax, min, max) &&
      (!q || `${r.invoiceNumber} ${r.clientName}`.toLowerCase().includes(q)));
  });

  /** Rendered in backend order -- not re-sorted client-side (the columns stay sortable). */
  readonly receivablesRows = computed<TableRow[]>(() => this.filteredReceivables().map(r => ({
    // The invoice number, not the display index: `tableTools`' rowId pins row heights and
    // sort to `row.id`, and an index changes with every search/filter.
    id:             r.invoiceNumber,
    invoiceNumber:  r.invoiceNumber,
    clientName:     r.clientName,
    clientType:     r.clientType,
    amountIncTax:   this.currency.transform(r.amountIncTax, r.currency),
    dueDate:        this.formatDate(r.dueDate),
    daysAgeing:     String(r.daysAgeing),
    ageingCategory: this.ageingBadge(r.ageingCategory),
    _source:        r,
  })));

  readonly receivablesConfig = computed<TableConfig>(() => ({
    showHeader:   false,
    hoverable:    true,
    loading:      this.isLoadingReceivables(),
    skeletonRows: 5,
    emptyMessage: this.emptyText(this.receivables().length, this.filteredReceivables().length,
                                 'REPORTING.DETAIL.CASH.RECEIVABLES.EMPTY'),
    ...tableTools(this.translate),
  }));

  readonly missingCashColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    // Every amount column sorts on its raw figure (`_source`), like the receivables above.
    const src = (row: TableRow) => row['_source'] as MissingCashRowDto;
    const amount = (key: keyof MissingCashRowDto, label: string, type: 'text' | 'custom' = 'text'): TableColumn => ({
      key, label: t(label), type, align: 'right', sortable: true, sortAccessor: row => src(row)[key],
    });
    return [
      { key: 'projectRef', label: t('REPORTING.DETAIL.CASH.MISSING_CASH.PROJECT'), type: 'text', sortable: true },
      amount('arTotal',          'REPORTING.DETAIL.CASH.MISSING_CASH.AR_TOTAL'),
      amount('arNotOverdue',     'REPORTING.DETAIL.CASH.MISSING_CASH.AR_NOT_OVERDUE'),
      amount('arLt1Month',       'REPORTING.DETAIL.CASH.MISSING_CASH.AR_LT_1M'),
      amount('ar1To2Months',     'REPORTING.DETAIL.CASH.MISSING_CASH.AR_1_2M'),
      amount('ar2To3Months',     'REPORTING.DETAIL.CASH.MISSING_CASH.AR_2_3M'),
      amount('ar3To6Months',     'REPORTING.DETAIL.CASH.MISSING_CASH.AR_3_6M'),
      amount('ar6To12Months',    'REPORTING.DETAIL.CASH.MISSING_CASH.AR_6_12M'),
      amount('arGt1Year',        'REPORTING.DETAIL.CASH.MISSING_CASH.AR_GT_1Y'),
      amount('wipTotal',         'REPORTING.DETAIL.CASH.MISSING_CASH.WIP_TOTAL'),
      amount('missingCashTotal', 'REPORTING.DETAIL.CASH.MISSING_CASH.MISSING_CASH_TOTAL', 'custom'),
    ];
  });

  // Missing cash — search on the project, filter on the missing-cash total and two flags.
  missingCashSearch    = signal('');
  missingCashAmountMin = signal('');
  missingCashAmountMax = signal('');
  missingCashWipOnly   = signal(false);
  missingCashGt1Year   = signal(false);

  readonly missingCashFilterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [{
      name: 'amountMin', label: t('REPORTING.DETAIL.TOOLBAR.MISSING_MIN'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name: 'amountMax', label: t('REPORTING.DETAIL.TOOLBAR.MISSING_MAX'), type: 'text',
      placeholder: t('REPORTING.DETAIL.TOOLBAR.AMOUNT_PH'),
    }, {
      name: 'wipOnly', label: t('REPORTING.DETAIL.TOOLBAR.WIP_ONLY'), type: 'checkbox',
    }, {
      name: 'gt1Year', label: t('REPORTING.DETAIL.TOOLBAR.GT_1Y_ONLY'), type: 'checkbox',
    }];
  });

  readonly missingCashFilterConfig = computed<SearchToolbarFilterConfig>(() => ({
    ...this.filterConfigBase(),
    initialValues: {
      amountMin: this.missingCashAmountMin(),
      amountMax: this.missingCashAmountMax(),
      wipOnly:   this.missingCashWipOnly(),
      gt1Year:   this.missingCashGt1Year(),
    },
  }));

  onMissingCashFilterApply(result: FilterResult): void {
    this.missingCashAmountMin.set(asText(result, 'amountMin'));
    this.missingCashAmountMax.set(asText(result, 'amountMax'));
    this.missingCashWipOnly.set(result['wipOnly'] === true);
    this.missingCashGt1Year.set(result['gt1Year'] === true);
  }

  onMissingCashFilterReset(): void {
    this.missingCashAmountMin.set('');
    this.missingCashAmountMax.set('');
    this.missingCashWipOnly.set(false);
    this.missingCashGt1Year.set(false);
  }

  private readonly filteredMissingCash = computed(() => {
    const q = this.missingCashSearch().trim().toLowerCase();
    const min = parseAmount(this.missingCashAmountMin()), max = parseAmount(this.missingCashAmountMax());
    const wipOnly = this.missingCashWipOnly(), gt1Year = this.missingCashGt1Year();
    return this.missingCash().filter(m =>
      inAmountRange(m.missingCashTotal, min, max) &&
      (!wipOnly || m.wipTotal > 0) &&
      (!gt1Year || m.arGt1Year > 0) &&
      (!q || (m.projectRef ?? '').toLowerCase().includes(q)));
  });

  /** Rendered in backend order -- already sorted descending by `missingCashTotal`
   *  server-side (`CashPositionService`); never re-sorted client-side. */
  readonly missingCashRows = computed<TableRow[]>(() => this.filteredMissingCash().map(m => ({
    // One row per affaire: its reference is the stable id `tableTools` needs (see receivables).
    id:                m.projectRef,
    _source:           m,
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
    showHeader:   false,
    hoverable:    true,
    loading:      this.isLoadingMissingCash(),
    skeletonRows: 5,
    emptyMessage: this.emptyText(this.missingCash().length, this.filteredMissingCash().length,
                                 'REPORTING.DETAIL.CASH.MISSING_CASH.EMPTY'),
    ...tableTools(this.translate),
  }));
}
