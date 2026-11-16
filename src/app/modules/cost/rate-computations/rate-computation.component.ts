import { Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  AccordionCardComponent, BadgeCell, BadgeVariant, ButtonComponent, ButtonOptions, CheckboxComponent,
  DafCellDirective, DataTableComponent, FieldMessageComponent, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, ModalRef, ModalService, PageComponent, PageHeaderComponent, SectionCardComponent,
  SelectComponent, SelectOption, StatusBadgeComponent, TabItem, TableColumn, TableConfig, TableRow, TabsComponent,
} from '@khalilrebhiitec/daf360';
import { Observable, forkJoin } from 'rxjs';

import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import {
  RateComputationDto, RateComputationLineDto, RateComputationAggregateDto,
  RateParametersRequest, PoolCompositionDto, RateComputationStatus, RateCostSource,
  formatAmount,
} from '../cost.model';
import { PaysRefDto } from '../../affaires/affaire.model';
import { UserStore } from '../../../core/user.store';
import { TableActionComponent } from '../../../shared/table-action.component';
import { tableTools } from '../../../shared/table-tools';

import { PageGuideComponent } from '../../../shared/guide/page-guide.component';
import type { GuideStep } from '../../../shared/guide/page-guide.types';

/** Guide de la page — `target` = un `data-guide` du gabarit. */
const step = (key: string, icon: string, target?: string, tab?: string): GuideStep => ({
  icon, titleKey: `GUIDE.RATES.${key}_TITLE`, textKey: `GUIDE.RATES.${key}_TEXT`, target, tab,
});
const GUIDE_STEPS: GuideStep[] = [
  step('INTRO', 'calculate', 'rate-header'),
  step('PAYS', 'public', 'rate-pays'),
  step('POOL', 'tune', 'rate-pool-btn'),
  step('FORMULA', 'function', 'rate-formula'),
  step('TABLE', 'table_rows', 'rate-table'),
  step('NEW', 'add', 'rate-new'),
  step('LIFECYCLE', 'route', 'rate-table'),
  step('DETAIL', 'insights', 'rate-table'),
  step('END', 'help'),
];

type DisplayCurrency = 'LOCAL' | 'EUR' | 'USD';
type DisplayFormat = 'HOUR' | 'DAY' | 'MONTH' | 'YEAR';
type DetailTab = 'INDIVIDUAL' | 'GRADE' | 'DISCIPLINE_GRADE';
type FormErrorField = 'year' | 'quarter' | 'month' | null;

/** Barème lifecycle → pastille (même lecture que l'ancienne palette gris / bleu / ambre / vert). */
const STATUS_VARIANT: Record<RateComputationStatus, BadgeVariant> = {
  DRAFT: 'neutral', COMPUTED: 'info', VALIDATED: 'warning', APPROVED: 'success',
};
const SOURCE_VARIANT: Record<RateCostSource, BadgeVariant> = {
  PAYROLL: 'success', EMPLOYEE_COST: 'info', NONE: 'danger',
};

/** The create / edit form. Percentages are typed as percents (5 = 5 %). */
interface RateForm {
  periodType: string;
  periodYear: number;
  periodQuarter: number | null;
  periodMonth: number | null;
  hqCostPct: number;
  targetMarginPct: number;
  productivityPct: number;
  workingDaysPerMonth: number;
  hoursPerDay: number;
  sellingMonthsPerYear: number;
  conversionDaysPerMonth: number;
}

/** One « Calcul » tile (steps 1–5 of F.04). */
interface CalcTile {
  key: string;
  value: string;
  options: MetricCardOptions;
}

@Component({
  selector: 'app-rate-computation',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, SelectComponent, ButtonComponent, SectionCardComponent,
    CheckboxComponent, StatusBadgeComponent, DataTableComponent, DafCellDirective, TableActionComponent,
    MetricCardComponent, TabsComponent, FormFieldComponent, FieldMessageComponent, AccordionCardComponent,
    PageGuideComponent,
  ],
  host: { class: 'block' },
  templateUrl: './rate-computation.component.html',
  styleUrl: './rate-computation.component.scss',
})
export class RateComputationComponent implements OnInit {
  readonly guideSteps = GUIDE_STEPS;

  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);
  private readonly userStore = inject(UserStore);
  private readonly modal     = inject(ModalService);

  private readonly formTpl = viewChild.required<TemplateRef<unknown>>('formTpl');
  private formRef: ModalRef | null = null;

  // ── permissions (the backend enforces them too; a 403 shows as an error banner) ──
  private readonly isSuperAdmin = computed(() => this.userStore.hasPermission('FACT_SUPER_ADMIN'));
  readonly canManage   = computed(() => this.isSuperAdmin() || this.userStore.hasPermission('FACT_MANAGE_COST'));
  readonly canValidate = computed(() => this.isSuperAdmin() || this.userStore.hasPermission('FACT_VALIDATE_RATES'));
  readonly canApprove  = computed(() => this.isSuperAdmin() || this.userStore.hasPermission('FACT_APPROVE_RATES'));

  // ── pays ────────────────────────────────────────────────────────────────
  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  /** Searchable drop-down: pays_ref holds the 194 countries since V75. */
  readonly paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` })));

  /** In `[pageActions]`, next to the buttons: no floating label (same as /finance/reporting/pl-catalogue). */
  readonly paysSelectConfig = computed(() => {
    this.translate.currentLang();
    return { searchable: true, fullWidth: false, placeholder: this.translate.instant('COST.FORM.PAYS_LABEL') };
  });

  /** The barème currency is the pays currency (pays_ref.devise), never typed. */
  readonly paysCurrency = computed(() =>
    this.paysList().find(p => p.id === this.paysId())?.devise ?? '—');

  onPaysSelected(values: string[]): void {
    const id = Number(values[0]);
    if (Number.isFinite(id) && id > 0) this.selectPays(id);
  }

  // ── list ────────────────────────────────────────────────────────────────
  computations    = signal<RateComputationDto[]>([]);
  isLoading       = signal(false);
  serverError     = signal<string | null>(null);
  actionError     = signal<string | null>(null);
  actionLoadingId = signal<number | null>(null);

  /** Full-page skeleton only until the pays are known; afterwards the table shows its own skeleton rows. */
  readonly pageLoading = computed(() => this.isLoading() && this.paysList().length === 0 && !this.serverError());

  /** `daf-page-header` interpolates its subtitle: the `<strong>` of the translation is dropped. */
  readonly subtitle = computed(() => {
    this.translate.currentLang();
    return String(this.translate.instant('COST.RATE.SUBTITLE')).replace(/<[^>]*>/g, '');
  });

  // ── create / edit form (daf-modal) ──────────────────────────────────────
  showAdvanced = signal(false);
  editingId    = signal<number | null>(null);
  isSaving     = signal(false);
  formError    = signal<string | null>(null);
  formErrorField = signal<FormErrorField>(null);
  readonly currentYear = new Date().getFullYear();
  form = signal<RateForm>(this.defaultForm());

  patchForm(patch: Partial<RateForm>): void {
    this.form.update(f => ({ ...f, ...patch }));
  }

  /** `daf-form-field` type number → number (NaN-safe; an emptied field reads as 0 like the old inputs' coercion). */
  num(v: string | number | null): number {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  readonly periodTypeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return ['ANNUAL', 'QUARTERLY', 'MONTHLY'].map(v => ({ value: v, label: this.translate.instant('COST.RATE.PERIOD.' + v) }));
  });

  readonly quarterOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    const q = this.translate.instant('COST.RATE.QUARTER_SHORT');
    return [1, 2, 3, 4].map(n => ({ value: String(n), label: `${q}${n}` }));
  });

  readonly monthOptions = computed<SelectOption[]>(() =>
    this.months().map(m => ({ value: String(m.value), label: m.label })));

  // ── pool composition ────────────────────────────────────────────────────
  showPoolEditor = signal(false);
  pool           = signal<PoolCompositionDto | null>(null);
  poolSelection  = signal<Set<string>>(new Set());
  isSavingPool   = signal(false);
  poolError      = signal<string | null>(null);

  // ── expanded detail ─────────────────────────────────────────────────────
  expandedId      = signal<number | null>(null);
  lines           = signal<RateComputationLineDto[]>([]);
  aggregates      = signal<RateComputationAggregateDto[]>([]);
  isLoadingDetail = signal(false);
  detailError     = signal<string | null>(null);
  detailTab       = signal<DetailTab>('INDIVIDUAL');
  displayCurrency = signal<DisplayCurrency>('LOCAL');
  displayFormat   = signal<DisplayFormat>('HOUR');

  readonly expanded = computed(() => this.computations().find(rc => rc.id === this.expandedId()) ?? null);
  readonly gradeAggregates = computed(() => this.aggregates().filter(a => a.granularity === 'GRADE'));
  readonly disciplineAggregates = computed(() => this.aggregates().filter(a => a.granularity === 'DISCIPLINE_GRADE'));

  readonly CURRENCIES: DisplayCurrency[] = ['LOCAL', 'EUR', 'USD'];
  readonly FORMATS: DisplayFormat[] = ['HOUR', 'DAY', 'MONTH', 'YEAR'];
  readonly TABS: DetailTab[] = ['INDIVIDUAL', 'GRADE', 'DISCIPLINE_GRADE'];

  readonly months = computed(() => {
    this.translate.currentLang();
    return Array.from({ length: 12 }, (_, i) => ({
      value: i + 1,
      label: this.translate.instant('COST.RATE.MONTHS.M' + (i + 1)),
    }));
  });

  // ── barèmes table ───────────────────────────────────────────────────────
  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const src = (row: TableRow) => row['_source'] as RateComputationDto;
    return [
      { key: 'period', label: t('COST.RATE.TH_PERIOD'), type: 'custom', sortable: true,
        sortAccessor: row => src(row).periodYear * 100 + (src(row).periodQuarter ?? 0) * 10 + (src(row).periodMonth ?? 0) },
      { key: 'type', label: t('COST.RATE.TH_TYPE'), sortable: true },
      { key: 'hq', label: t('COST.RATE.TH_HQ'), align: 'right', sortable: true, sortAccessor: row => src(row).hqCostPct },
      { key: 'margin', label: t('COST.RATE.TH_MARGIN'), align: 'right', sortable: true, sortAccessor: row => src(row).targetMarginPct },
      { key: 'productivity', label: t('COST.RATE.TH_PRODUCTIVITY'), align: 'right', sortable: true,
        sortAccessor: row => src(row).productivityRate },
      { key: 'currency', label: t('COST.RATE.TH_CURRENCY'), sortable: true },
      { key: 'status', label: t('COST.RATE.TH_STATUS'), type: 'badge', sortable: true },
      { key: 'validated', label: t('COST.RATE.TH_VALIDATED'), sortable: true, sortAccessor: row => src(row).validatedAt },
      { key: 'approved', label: t('COST.RATE.TH_APPROVED'), sortable: true, sortAccessor: row => src(row).approvedAt },
      // An explicit width: tableTools() turns on the fixed layout, where '1%' is a few pixels.
      { key: '_actions', label: '', align: 'right', width: '12rem' },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.computations().map(rc => ({
      id: rc.id,
      period: this.periodLabel(rc),
      type: this.periodTypeLabel(rc.periodType),
      hq: this.pct(rc.hqCostPct),
      margin: this.pct(rc.targetMarginPct),
      productivity: this.pct(rc.productivityRate),
      currency: rc.currency ?? '—',
      status: {
        label: this.rateStatusLabel(rc.status),
        options: { variant: this.statusVariant(rc.status), size: 'sm', dot: true },
      } satisfies BadgeCell,
      validated: this.who(rc.validatedByName, rc.validatedAt),
      approved: this.who(rc.approvedByName, rc.approvedAt),
      _source: rc,
    }));
  });

  readonly tableConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable: true,
    loading: this.isLoading(),
    skeletonRows: 4,
    emptyMessage: this.translate.instant('COST.RATE.EMPTY'),
    ...tableTools(this.translate),
  }));

  /** Tooltips of the row actions, re-read on a language change. */
  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      detail:    t('COST.RATE.LINES.TOGGLE_TITLE'),
      compute:   `${t('COST.RATE.COMPUTE')} — ${t('COST.RATE.COMPUTE_TITLE')}`,
      recompute: `${t('COST.RATE.RECOMPUTE')} — ${t('COST.RATE.COMPUTE_TITLE')}`,
      edit:      t('COST.RATE.EDIT'),
      delete:    t('COST.RATE.DELETE'),
      validate:  `${t('COST.RATE.VALIDATE')} — ${t('COST.RATE.VALIDATE_TITLE')}`,
      approve:   `${t('COST.RATE.APPROVE')} — ${t('COST.RATE.APPROVE_TITLE')}`,
      return:    t('COST.RATE.RETURN_TITLE'),
    };
  });

  // ── detail: calcul tiles, view switches, granularity tables ─────────────
  readonly calcTiles = computed<CalcTile[]>(() => {
    const rc = this.expanded();
    if (!rc?.computedAt) return [];
    const main = (icon: string): MetricCardOptions => ({ icon, iconColor: 'text-primary', iconBg: 'bg-primary/10' });
    const sub = (icon: string): MetricCardOptions => ({ icon, iconColor: 'text-on-surface-variant', iconBg: 'bg-surface-container' });
    return [
      { key: 'TOTAL_ENTITY_COST',    value: this.fmtLocal(rc.totalEntityCost, rc),      options: main('account_balance') },
      { key: 'BILLABLE_SALARIES',    value: this.fmtLocal(rc.billableSalaries, rc),     options: sub('engineering') },
      { key: 'NONBILLABLE_SALARIES', value: this.fmtLocal(rc.nonbillableSalaries, rc),  options: sub('support_agent') },
      { key: 'POOL_CATEGORIES',      value: this.fmtLocal(rc.poolCategoriesCost, rc),   options: sub('category') },
      { key: 'OVERHEAD_POOL',        value: this.fmtLocal(rc.overheadPool, rc),         options: main('savings') },
      { key: 'ETPT',                 value: this.fmtNumber(rc.etpt, 3),                 options: main('groups') },
      { key: 'SELLABLE_HOURS',       value: this.fmtNumber(rc.sellableHoursPerEtpt),    options: main('schedule') },
      { key: 'OVERHEAD_PER_HOUR',    value: this.fmtLocal(rc.overheadPerHour, rc),      options: main('timer') },
    ];
  });

  currencyButton(c: DisplayCurrency, rc: RateComputationDto): ButtonOptions {
    return {
      variant: 'toggle', size: 'sm', active: this.displayCurrency() === c,
      label: c === 'LOCAL' ? (rc.currency ?? this.translate.instant('COST.RATE.VIEW.LOCAL')) : c,
    };
  }

  formatButton(f: DisplayFormat): ButtonOptions {
    return {
      variant: 'toggle', size: 'sm', active: this.displayFormat() === f,
      label: this.translate.instant('COST.RATE.VIEW.' + f),
    };
  }

  readonly detailTabs = computed<TabItem[]>(() => {
    this.translate.currentLang();
    const counts: Record<DetailTab, number> = {
      INDIVIDUAL: this.lines().length,
      GRADE: this.gradeAggregates().length,
      DISCIPLINE_GRADE: this.disciplineAggregates().length,
    };
    return this.TABS.map(t => ({
      id: t,
      label: this.translate.instant('COST.RATE.TABS.' + t),
      count: this.isLoadingDetail() ? null : counts[t],
    }));
  });

  onDetailTab(id: string): void {
    if ((this.TABS as string[]).includes(id)) this.detailTab.set(id as DetailTab);
  }

  /** The rate columns shared by the three granularities, in the chosen format and currency. */
  private rateColumns(withOverhead: boolean): TableColumn[] {
    const t = (k: string) => this.translate.instant(k);
    const num = (key: string) => (row: TableRow) => row[key] as number | null;
    const cols: TableColumn[] = [
      { key: 'direct', label: t('COST.RATE.LINES.TH_DIRECT_COST'), align: 'right', sortable: true, sortAccessor: num('_direct') },
    ];
    if (withOverhead) {
      cols.push({ key: 'overhead', label: t('COST.RATE.LINES.TH_OVERHEAD'), align: 'right', sortable: true, sortAccessor: num('_overhead') });
    }
    cols.push(
      { key: 'total', label: t('COST.RATE.LINES.TH_TOTAL_COST'), align: 'right', sortable: true, sortAccessor: num('_total') },
      { key: 'interco', label: t('COST.RATE.LINES.TH_INTERCO_RATE'), align: 'right', sortable: true, sortAccessor: num('_interco') },
      { key: 'sale', label: t('COST.RATE.LINES.TH_SALE_RATE'), type: 'custom', align: 'right', sortable: true, sortAccessor: num('_sale') },
    );
    return cols;
  }

  readonly detailColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    switch (this.detailTab()) {
      case 'INDIVIDUAL': return [
        { key: 'employee', label: t('COST.RATE.LINES.TH_EMPLOYEE'), sortable: true },
        { key: 'grade', label: t('COST.RATE.LINES.TH_GRADE'), sortable: true },
        { key: 'discipline', label: t('COST.RATE.LINES.TH_DISCIPLINE'), sortable: true },
        { key: 'source', label: t('COST.RATE.LINES.TH_SOURCE'), type: 'badge', sortable: true },
        ...this.rateColumns(true),
      ];
      case 'GRADE': return [
        { key: 'grade', label: t('COST.RATE.LINES.TH_GRADE'), sortable: true },
        { key: 'headcount', label: t('COST.RATE.LINES.TH_HEADCOUNT'), align: 'right', sortable: true },
        ...this.rateColumns(false),
      ];
      case 'DISCIPLINE_GRADE': return [
        { key: 'discipline', label: t('COST.RATE.LINES.TH_DISCIPLINE'), sortable: true },
        { key: 'grade', label: t('COST.RATE.LINES.TH_GRADE'), sortable: true },
        { key: 'headcount', label: t('COST.RATE.LINES.TH_HEADCOUNT'), align: 'right', sortable: true },
        ...this.rateColumns(false),
      ];
    }
  });

  readonly detailRows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const rc = this.expanded();
    if (!rc) return [];
    // Read so the cells follow the currency / format switches.
    this.displayCurrency();
    this.displayFormat();
    const rates = (r: {
      directCostPerHour: number | null; totalCostPerHour: number | null;
      intercoRatePerHour: number | null; saleRatePerHour: number | null;
    }) => ({
      direct: this.fmtRate(r.directCostPerHour, rc), _direct: this.displayValue(r.directCostPerHour, rc),
      total: this.fmtRate(r.totalCostPerHour, rc), _total: this.displayValue(r.totalCostPerHour, rc),
      interco: this.fmtRate(r.intercoRatePerHour, rc), _interco: this.displayValue(r.intercoRatePerHour, rc),
      sale: this.fmtRate(r.saleRatePerHour, rc), _sale: this.displayValue(r.saleRatePerHour, rc),
    });
    switch (this.detailTab()) {
      case 'INDIVIDUAL': return this.lines().map(line => ({
        id: line.id,
        employee: line.employeeName ?? ('#' + line.profileUserId),
        grade: line.gradeLabel ?? line.gradeCode ?? '—',
        discipline: line.disciplineLabel ?? line.disciplineCode ?? '—',
        source: {
          label: this.sourceLabel(line.costSource),
          options: { variant: SOURCE_VARIANT[line.costSource] ?? 'neutral', size: 'sm' },
        } satisfies BadgeCell,
        overhead: this.fmtRate(line.overheadPerHour, rc), _overhead: this.displayValue(line.overheadPerHour, rc),
        ...rates(line),
      }));
      case 'GRADE': return this.gradeAggregates().map(a => ({
        id: a.id,
        grade: a.gradeLabel ?? a.gradeCode,
        headcount: a.headcount,
        ...rates(a),
      }));
      case 'DISCIPLINE_GRADE': return this.disciplineAggregates().map(a => ({
        id: a.id,
        discipline: a.disciplineLabel ?? a.disciplineCode,
        grade: a.gradeLabel ?? a.gradeCode,
        headcount: a.headcount,
        ...rates(a),
      }));
    }
  });

  readonly detailTableConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable: true,
    loading: this.isLoadingDetail(),
    skeletonRows: 5,
    emptyMessage: this.translate.instant('COST.RATE.LINES.EMPTY'),
    ...tableTools(this.translate),
  }));

  ngOnInit(): void {
    this.isLoading.set(true);
    forkJoin({ myPays: this.clientSvc.getMyPays(), allPays: this.clientSvc.getPays() }).subscribe({
      next: ({ myPays, allPays }) => {
        this.paysList.set(allPays);
        const resolved = myPays ?? (allPays.length > 0 ? allPays[0].id : 0);
        if (resolved > 0) {
          this.paysId.set(resolved);
          this.load();
        } else {
          this.serverError.set(this.translate.instant('COST.RATE.NO_PAYS'));
          this.isLoading.set(false);
        }
      },
      error: () => {
        this.serverError.set(this.translate.instant('COST.RATE.LOAD_PAYS_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  selectPays(id: number): void {
    if (id === this.paysId()) return;
    this.paysId.set(id);
    this.closeForm();
    this.showPoolEditor.set(false);
    this.expandedId.set(null);
    this.load();
  }

  private load(): void {
    this.isLoading.set(true);
    this.serverError.set(null);
    this.actionError.set(null);
    this.svc.getRateComputations(this.paysId()).subscribe({
      next: list => { this.computations.set(list); this.isLoading.set(false); },
      error: err => {
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.RATE.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  // ── create / edit ───────────────────────────────────────────────────────
  private defaultForm(): RateForm {
    return {
      periodType: 'ANNUAL', periodYear: this.currentYear, periodQuarter: null, periodMonth: null,
      hqCostPct: 5, targetMarginPct: 10, productivityPct: 94,
      workingDaysPerMonth: 18, hoursPerDay: 8, sellingMonthsPerYear: 12, conversionDaysPerMonth: 22,
    };
  }

  private formFrom(rc: RateComputationDto): RateForm {
    return {
      periodType: rc.periodType, periodYear: rc.periodYear,
      periodQuarter: rc.periodQuarter, periodMonth: rc.periodMonth,
      hqCostPct: (rc.hqCostPct ?? 0.05) * 100,
      targetMarginPct: (rc.targetMarginPct ?? 0.10) * 100,
      productivityPct: (rc.productivityRate ?? 0.94) * 100,
      workingDaysPerMonth: rc.workingDaysPerMonth ?? 18,
      hoursPerDay: rc.hoursPerDay ?? 8,
      sellingMonthsPerYear: rc.sellingMonthsPerYear ?? 12,
      conversionDaysPerMonth: rc.conversionDaysPerMonth ?? 22,
    };
  }

  openCreate(): void {
    this.editingId.set(null);
    this.form.set(this.defaultForm());
    this.clearFormError();
    this.showAdvanced.set(false);
    this.openFormModal(null);
  }

  startEdit(rc: RateComputationDto): void {
    this.editingId.set(rc.id);
    this.form.set(this.formFrom(rc));
    this.clearFormError();
    this.showAdvanced.set(false);
    this.openFormModal(rc);
  }

  /** Same pop-up as the other admin forms (reminder rules, configurable lists): buttons in the modal footer. */
  private openFormModal(rc: RateComputationDto | null): void {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    this.formRef?.close();
    this.formRef = this.modal.open({
      title: rc ? t('COST.RATE.EDIT_TITLE', { period: this.periodLabel(rc) }) : t('COST.RATE.NEW'),
      subtitle: t('COST.RATE.TITLE'),
      icon: 'calculate',
      body: this.formTpl(),
      size: 'lg',
      minWidth: '360px',
      resizable: true,
      maximizable: true,
      closeOnBackdrop: false,
      buttons: [
        { label: t('COST.RATE.CANCEL'), variant: 'secondary', action: () => this.closeForm() },
        { label: t('COST.RATE.SAVE'), variant: 'primary', icon: 'save', action: () => this.saveForm() },
      ],
    });
  }

  closeForm(): void {
    this.formRef?.close();
    this.formRef = null;
    this.showAdvanced.set(false);
    this.editingId.set(null);
    this.clearFormError();
  }

  private clearFormError(): void {
    this.formError.set(null);
    this.formErrorField.set(null);
  }

  private fail(field: FormErrorField, key: string): null {
    this.formErrorField.set(field);
    this.formError.set(this.translate.instant(key));
    return null;
  }

  private toRequest(): RateParametersRequest | null {
    const f = this.form();
    if (!f.periodYear) return this.fail('year', 'COST.RATE.YEAR_REQUIRED');
    if (f.periodType === 'QUARTERLY' && !f.periodQuarter) return this.fail('quarter', 'COST.RATE.QUARTER_REQUIRED');
    if (f.periodType === 'MONTHLY' && !f.periodMonth) return this.fail('month', 'COST.RATE.MONTH_REQUIRED');
    return {
      periodType: f.periodType,
      periodYear: Number(f.periodYear),
      periodQuarter: f.periodType === 'QUARTERLY' ? f.periodQuarter : null,
      periodMonth: f.periodType === 'MONTHLY' ? f.periodMonth : null,
      hqCostPct: f.hqCostPct / 100,
      targetMarginPct: f.targetMarginPct / 100,
      productivityRate: f.productivityPct / 100,
      workingDaysPerMonth: f.workingDaysPerMonth,
      hoursPerDay: f.hoursPerDay,
      sellingMonthsPerYear: f.sellingMonthsPerYear,
      conversionDaysPerMonth: f.conversionDaysPerMonth,
    };
  }

  saveForm(): void {
    // The modal footer buttons are frozen at open: a second click while saving is ignored here.
    if (this.isSaving()) return;
    this.clearFormError();
    const req = this.toRequest();
    if (!req) return;
    this.isSaving.set(true);
    const id = this.editingId();
    const call$ = id == null
      ? this.svc.createRateComputation({ ...req, paysId: this.paysId() })
      : this.svc.updateRateComputation(id, req);
    call$.subscribe({
      next: saved => {
        this.computations.update(list => id == null ? [saved, ...list] : list.map(r => r.id === saved.id ? saved : r));
        if (id != null && this.expandedId() === id) this.loadDetail(id);
        this.isSaving.set(false);
        this.closeForm();
      },
      error: err => {
        this.formError.set(err.error?.message ?? this.translate.instant('COST.RATE.SAVE_ERROR'));
        this.isSaving.set(false);
      },
    });
  }

  // ── lifecycle actions ───────────────────────────────────────────────────
  private run(rc: RateComputationDto, call$: Observable<RateComputationDto>, errorKey: string): void {
    this.actionLoadingId.set(rc.id);
    this.actionError.set(null);
    call$.subscribe({
      next: updated => {
        this.computations.update(list => list.map(r => r.id === updated.id ? updated : r));
        this.actionLoadingId.set(null);
        if (this.expandedId() === updated.id) this.loadDetail(updated.id);
      },
      error: err => {
        this.actionError.set(err.error?.message ?? this.translate.instant(errorKey));
        this.actionLoadingId.set(null);
      },
    });
  }

  compute(rc: RateComputationDto): void { this.run(rc, this.svc.computeRateComputation(rc.id), 'COST.RATE.COMPUTE_ERROR'); }
  validate(rc: RateComputationDto): void { this.run(rc, this.svc.validateRateComputation(rc.id), 'COST.RATE.VALIDATE_ERROR'); }
  approve(rc: RateComputationDto): void { this.run(rc, this.svc.approveRateComputation(rc.id), 'COST.RATE.APPROVE_ERROR'); }
  returnToDraft(rc: RateComputationDto): void { this.run(rc, this.svc.returnRateComputation(rc.id), 'COST.RATE.RETURN_ERROR'); }

  /** Confirmation in a daf-modal (house pattern, cf. client-detail `confirmThen`), then delete. */
  confirmDelete(rc: RateComputationDto): void {
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    this.modal.open({
      title: t('COST.RATE.DELETE_CONFIRM_TITLE'),
      body: t('COST.RATE.DELETE_CONFIRM_BODY', { period: this.periodLabel(rc) }),
      icon: 'delete',
      size: 'sm',
      buttons: [
        { label: t('COST.RATE.CANCEL'), variant: 'secondary', action: r => r.close() },
        { label: t('COST.RATE.DELETE'), variant: 'primary', icon: 'delete', action: r => { r.close(); this.remove(rc); } },
      ],
    });
  }

  private remove(rc: RateComputationDto): void {
    this.actionLoadingId.set(rc.id);
    this.actionError.set(null);
    this.svc.deleteRateComputation(rc.id).subscribe({
      next: () => {
        this.computations.update(list => list.filter(r => r.id !== rc.id));
        if (this.expandedId() === rc.id) this.expandedId.set(null);
        this.actionLoadingId.set(null);
      },
      error: err => {
        this.actionError.set(err.error?.message ?? this.translate.instant('COST.RATE.DELETE_ERROR'));
        this.actionLoadingId.set(null);
      },
    });
  }

  isEditable(rc: RateComputationDto): boolean {
    return rc.status === 'DRAFT' || rc.status === 'COMPUTED';
  }

  // ── pool composition ────────────────────────────────────────────────────
  togglePoolEditor(): void {
    this.showPoolEditor.update(v => !v);
    if (this.showPoolEditor()) this.loadPool();
  }

  private loadPool(): void {
    this.poolError.set(null);
    this.svc.getPoolComposition(this.paysId()).subscribe({
      next: p => this.setPool(p),
      error: err => this.poolError.set(err.error?.message ?? this.translate.instant('COST.RATE.POOL.LOAD_ERROR')),
    });
  }

  private setPool(p: PoolCompositionDto): void {
    this.pool.set(p);
    this.poolSelection.set(new Set(p.categories.filter(c => c.inPool).map(c => c.code)));
  }

  setPoolCategory(code: string, checked: boolean): void {
    this.poolSelection.update(s => {
      const next = new Set(s);
      if (checked) next.add(code); else next.delete(code);
      return next;
    });
  }

  savePool(): void {
    this.isSavingPool.set(true);
    this.poolError.set(null);
    this.svc.savePoolComposition(this.paysId(), [...this.poolSelection()]).subscribe({
      next: p => { this.setPool(p); this.isSavingPool.set(false); },
      error: err => {
        this.poolError.set(err.error?.message ?? this.translate.instant('COST.RATE.POOL.SAVE_ERROR'));
        this.isSavingPool.set(false);
      },
    });
  }

  // ── expanded detail ─────────────────────────────────────────────────────
  onRowClick(row: TableRow): void {
    this.toggleExpand(row['_source'] as RateComputationDto);
  }

  toggleExpand(rc: RateComputationDto): void {
    if (this.expandedId() === rc.id) { this.expandedId.set(null); return; }
    this.expandedId.set(rc.id);
    this.detailTab.set('INDIVIDUAL');
    this.loadDetail(rc.id);
    // The detail opens under the table: bring it into view.
    setTimeout(() => document.getElementById('rate-detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  private loadDetail(id: number): void {
    this.isLoadingDetail.set(true);
    this.detailError.set(null);
    forkJoin({
      lines: this.svc.getRateComputationLines(id),
      aggregates: this.svc.getRateComputationAggregates(id),
    }).subscribe({
      next: ({ lines, aggregates }) => {
        this.lines.set(lines);
        this.aggregates.set(aggregates);
        this.isLoadingDetail.set(false);
      },
      error: err => {
        this.detailError.set(err.error?.message ?? this.translate.instant('COST.RATE.LINES.LOAD_ERROR'));
        this.isLoadingDetail.set(false);
      },
    });
  }

  /** Hourly value (barème currency) -> chosen format and currency, with the barème's frozen parameters. */
  displayValue(hourly: number | null, rc: RateComputationDto): number | null {
    if (hourly == null) return null;
    let v = hourly;
    const f = this.displayFormat();
    if (f !== 'HOUR') v *= rc.hoursPerDay ?? 8;
    if (f === 'MONTH' || f === 'YEAR') v *= rc.conversionDaysPerMonth ?? 22;
    if (f === 'YEAR') v *= 12;
    const c = this.displayCurrency();
    if (c === 'EUR') { if (!rc.fxEurRate) return null; v /= rc.fxEurRate; }
    if (c === 'USD') { if (!rc.fxUsdRate) return null; v /= rc.fxUsdRate; }
    return v;
  }

  displayCurrencyCode(rc: RateComputationDto): string {
    const c = this.displayCurrency();
    return c === 'LOCAL' ? (rc.currency ?? 'EUR') : c;
  }

  fmtRate(hourly: number | null, rc: RateComputationDto): string {
    return formatAmount(this.displayValue(hourly, rc), this.displayCurrencyCode(rc));
  }

  fmtLocal(v: number | null, rc: RateComputationDto): string {
    return formatAmount(v, rc.currency ?? 'EUR');
  }

  fmtNumber(v: number | null, digits = 2): string {
    return v == null ? '—' : v.toLocaleString('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  sourceLabel(source: RateCostSource): string {
    return this.translate.instant('COST.RATE.LINES.SOURCE.' + source);
  }

  // ── labels ──────────────────────────────────────────────────────────────
  rateStatusLabel(status: string): string { return this.translate.instant('COST.RATE.STATUS.' + status); }
  periodTypeLabel(type: string): string { return this.translate.instant('COST.RATE.PERIOD.' + type); }
  statusVariant(status: RateComputationStatus): BadgeVariant { return STATUS_VARIANT[status] ?? 'neutral'; }

  periodLabel(rc: RateComputationDto): string {
    if (rc.periodType === 'QUARTERLY') return `${this.translate.instant('COST.RATE.QUARTER_SHORT')}${rc.periodQuarter} / ${rc.periodYear}`;
    if (rc.periodType === 'MONTHLY') {
      const m = this.months().find(x => x.value === rc.periodMonth);
      return `${m?.label ?? rc.periodMonth} ${rc.periodYear}`;
    }
    return `${rc.periodYear}`;
  }

  pct(v: number | null): string {
    return v == null ? '—' : (v * 100).toFixed(1) + ' %';
  }

  fmtDate(d: string | null): string {
    return d ? new Date(d).toLocaleDateString('fr-FR') : '—';
  }

  who(name: string | null, at: string | null): string {
    if (!at) return '—';
    return name ? `${name} · ${this.fmtDate(at)}` : this.fmtDate(at);
  }
}
