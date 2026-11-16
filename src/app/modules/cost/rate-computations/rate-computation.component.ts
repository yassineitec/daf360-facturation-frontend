import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { SelectComponent, SelectOption } from '@khalilrebhiitec/daf360';
import { Observable, forkJoin } from 'rxjs';

import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import {
  RateComputationDto, RateComputationLineDto, RateComputationAggregateDto,
  RateParametersRequest, PoolCompositionDto, RateCostSource,
  RATE_COMPUTATION_STATUS_CONFIG, formatAmount,
} from '../cost.model';
import { PaysRefDto } from '../../affaires/affaire.model';
import { UserStore } from '../../../core/user.store';

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

/** The create / edit row. Percentages are typed as percents (5 = 5 %). */
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

@Component({
  selector: 'app-rate-computation',
  standalone: true,
  imports: [CommonModule, FormsModule, TranslatePipe, SelectComponent, PageGuideComponent],
  templateUrl: './rate-computation.component.html',
  styleUrl: './rate-computation.component.scss',
})
export class RateComputationComponent implements OnInit {
  readonly guideSteps = GUIDE_STEPS;

  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);
  private readonly userStore = inject(UserStore);

  // ── permissions (the backend enforces them too; a 403 shows as an error banner) ──
  readonly canManage   = computed(() => this.userStore.hasPermission('FACT_MANAGE_COST'));
  readonly canValidate = computed(() => this.userStore.hasPermission('FACT_VALIDATE_RATES'));
  readonly canApprove  = computed(() => this.userStore.hasPermission('FACT_APPROVE_RATES'));

  // ── pays ────────────────────────────────────────────────────────────────
  paysList = signal<PaysRefDto[]>([]);
  paysId   = signal<number>(0);

  /** Searchable drop-down: pays_ref holds the 194 countries since V75. */
  readonly paysOptions = computed<SelectOption[]>(() =>
    this.paysList().map(p => ({ value: String(p.id), label: `${p.frenchLabel} (${p.isoCode})` })));

  readonly paysSelectConfig = computed(() => {
    this.translate.currentLang();
    return { label: this.translate.instant('COST.FORM.PAYS_LABEL'), searchable: true, fullWidth: false };
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
  confirmDeleteId = signal<number | null>(null);

  // ── create / edit row ───────────────────────────────────────────────────
  showAddForm  = signal(false);
  showAdvanced = signal(false);
  editingId    = signal<number | null>(null);
  isSaving     = signal(false);
  formError    = signal<string | null>(null);
  readonly currentYear = new Date().getFullYear();
  form: RateForm = this.defaultForm();

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

  readonly STATUS_CONFIG = RATE_COMPUTATION_STATUS_CONFIG;
  readonly SOURCE_CONFIG: Record<RateCostSource, { bg: string; text: string }> = {
    PAYROLL:       { bg: '#d1fae5', text: '#065f46' },
    EMPLOYEE_COST: { bg: '#dbeafe', text: '#1d4ed8' },
    NONE:          { bg: '#fee2e2', text: '#991b1b' },
  };
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

  toggleAddForm(): void {
    if (this.showAddForm()) { this.closeForm(); return; }
    this.editingId.set(null);
    this.form = this.defaultForm();
    this.formError.set(null);
    this.showAddForm.set(true);
  }

  startEdit(rc: RateComputationDto): void {
    this.editingId.set(rc.id);
    this.form = this.formFrom(rc);
    this.formError.set(null);
    this.showAdvanced.set(false);
    this.showAddForm.set(true);
  }

  closeForm(): void {
    this.showAddForm.set(false);
    this.showAdvanced.set(false);
    this.editingId.set(null);
    this.formError.set(null);
  }

  private toRequest(): RateParametersRequest | null {
    const f = this.form;
    if (!f.periodYear) { this.formError.set(this.translate.instant('COST.RATE.YEAR_REQUIRED')); return null; }
    if (f.periodType === 'QUARTERLY' && !f.periodQuarter) { this.formError.set(this.translate.instant('COST.RATE.QUARTER_REQUIRED')); return null; }
    if (f.periodType === 'MONTHLY' && !f.periodMonth) { this.formError.set(this.translate.instant('COST.RATE.MONTH_REQUIRED')); return null; }
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
    const req = this.toRequest();
    if (!req) return;
    this.isSaving.set(true);
    this.formError.set(null);
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

  /** First click arms the button, second click deletes. */
  remove(rc: RateComputationDto): void {
    if (this.confirmDeleteId() !== rc.id) { this.confirmDeleteId.set(rc.id); return; }
    this.confirmDeleteId.set(null);
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

  togglePoolCategory(code: string): void {
    this.poolSelection.update(s => {
      const next = new Set(s);
      if (next.has(code)) next.delete(code); else next.add(code);
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
  toggleExpand(rc: RateComputationDto): void {
    if (this.expandedId() === rc.id) { this.expandedId.set(null); return; }
    this.expandedId.set(rc.id);
    this.detailTab.set('INDIVIDUAL');
    this.loadDetail(rc.id);
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
