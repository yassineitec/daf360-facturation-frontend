import { Component, OnInit, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, MetricDelta, ModalRef, ModalService, PageComponent, PageHeaderComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { SalaryAdvanceApprovalService, SalaryAdvanceDto } from '../salary-advances/salary-advance-approval.service';
import { currencyFractionDigits } from '../../../shared/currency-decimals.util';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { UserStore } from '../../../core/user.store';
import { HiringCostApprovalDto, HiringCostApprovalService } from '../hiring-cost-approval.service';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { CostLineDto, localizedLabel } from '../cost.model';
import { approvalLevelKey, formatDate, urgencyKey } from '../cost-display';
import { ApprovalItem, ApprovalKind, itemUrgency, kindKey } from './approval-item';
import { ApprovalCardsSectionComponent, ApprovalDecision } from './approval-cards-section.component';
import { ApprovalTableSectionComponent } from './approval-table-section.component';

type ViewMode = 'grid' | 'list';
/** The three decisions a cost line supports — the service has an endpoint for each. */
type CostDecision = 'approve' | 'return' | 'reject';

@Component({
  selector: 'app-cost-approval-queue',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, ButtonComponent, MetricCardComponent,
    SearchToolbarComponent, FormFieldComponent,
    ApprovalCardsSectionComponent, ApprovalTableSectionComponent,
  ],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './cost-approval-queue.component.html',
})
export class CostApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly hiringSvc = inject(HiringCostApprovalService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly userStore = inject(UserStore);
  private readonly advanceSvc = inject(SalaryAdvanceApprovalService);

  @ViewChild('approvalTpl')       private approvalTpl!:       TemplateRef<unknown>;
  @ViewChild('hiringApprovalTpl') private hiringApprovalTpl!: TemplateRef<unknown>;
  @ViewChild('advanceDecisionTpl') private advanceDecisionTpl!: TemplateRef<unknown>;
  private approvalRef:       ModalRef | null = null;
  private hiringApprovalRef: ModalRef | null = null;
  private advanceRef:        ModalRef | null = null;

  paysId        = signal<number>(0);
  costs         = signal<CostLineDto[]>([]);
  hiringPending = signal<HiringCostApprovalDto[]>([]);
  isLoading     = signal(true);
  hiringLoading = signal(false);
  hiringError   = signal<string | null>(null);
  firstLoad     = signal(true);

  searchTerm     = signal('');
  filterKind     = signal<'' | ApprovalKind>('');
  filterPriority = signal('');
  /** Approval level (`L1`–`L4`) — cost lines only, hiring requests carry none. */
  filterLevel     = signal('');
  /** COST_CATEGORY id (as a string) — cost lines only. */
  filterCategory  = signal('');
  /** Date shown on the card (transaction date for a cost, submission date for a hiring request). */
  filterDateRange = signal<Date[] | null>(null);
  /** COST_SUB_CATEGORY id (as a string) — cost lines only. */
  filterSubCategory = signal('');
  /** Original currency code (cost line `currency`, hiring snapshot `localCurrency`), '' = all. */
  filterCurrency  = signal('');
  /** Minimum of the amount shown on the card, typed as text ('1 500,50' accepted, '' = no bound). */
  filterAmountMin = signal('');
  /** Maximum of the amount shown on the card, typed as text ('' = no bound). */
  filterAmountMax = signal('');
  viewMode       = signal<ViewMode>('grid');

  readonly canApproveCost = computed(() => this.userStore.hasPermission('FACT_APPROVE_COST_L1'));

  // ── Salary advances (payroll V25) ──────────────────────────────────────────
  /**
   * Awaiting finance's decision. Finance is only the decision hub: once approved, the payout,
   * the monthly deductions and the rules are payroll's (/payroll/salary-advances).
   */
  advances         = signal<SalaryAdvanceDto[]>([]);
  advancesLoading  = signal(false);
  selectedAdvance  = signal<SalaryAdvanceDto | null>(null);
  advanceDecision  = signal<'approve' | 'reject'>('approve');
  advanceComment   = signal('');
  advanceModalError = signal<string | null>(null);

  /** FACT_APPROVE_SALARY_ADVANCE — the code payroll-service enforces on the decision endpoints. */
  readonly canDecideAdvance = computed(() => this.userStore.hasPermission('FACT_APPROVE_SALARY_ADVANCE'));

  // ── Cost decision modal ────────────────────────────────────────────────────
  selectedCost       = signal<CostLineDto | null>(null);
  modalDecision      = signal<CostDecision>('approve');
  approvalCommentSig = signal('');
  modalError         = signal<string | null>(null);

  // ── Hiring decision modal ──────────────────────────────────────────────────
  selectedHiring      = signal<HiringCostApprovalDto | null>(null);
  hiringDecision      = signal<'approve' | 'reject'>('approve');
  hiringCommentSig    = signal('');
  hiringContrePropSig = signal<number | null>(null);
  hiringModalError    = signal<string | null>(null);

  /**
   * The two queues merged onto one shape (see `approval-item.ts`) so the card grid, the
   * table and the filters all read the same thing instead of the template carrying two
   * near-identical card blocks.
   */
  readonly items = computed<ApprovalItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    const costItems: ApprovalItem[] = this.costs().map(c => ({
      key:       `cost-${c.id}`,
      kind:      'cost',
      id:        c.id,
      reference: c.reference ?? `COUT-${c.id}`,
      title:     c.label || '—',
      level:     c.approvalLevelRequired,
      urgency:   itemUrgency('cost', c.approvalLevelRequired),
      dateLabel: formatDate(c.transactionDate),
      amountLabel: this.costAmountLabel(c),
      sortDate:   c.transactionDate,
      sortAmount: c.netAmountEur ?? c.netAmountLocal ?? null,
      metrics: [
        { label: t('COST.APPROVAL_QUEUE.PRIORITY'),     value: t(urgencyKey(c.approvalLevelRequired)) },
        { label: t('COST.APPROVAL_QUEUE.DATE'),         value: formatDate(c.transactionDate) },
        { label: t('COST.APPROVAL_QUEUE.AMOUNT_TOTAL'), value: this.costAmountLabel(c) },
        { label: t('COST.APPROVAL_QUEUE.KIND'),         value: t(kindKey('cost')) },
      ],
      cost: c,
    }));

    const hiringItems: ApprovalItem[] = this.hiringPending().map(h => {
      const snap = this.hiringSvc.parseSnapshot(h.simulationSnapshot);
      const cur  = snap.localCurrency ?? 'TND';
      const annual = snap.loadedCost != null ? snap.loadedCost * 12 : null;
      return {
        key:       `hiring-${h.id}`,
        kind:      'hiring',
        id:        h.id,
        reference: `${h.contractTypeCode} · ${h.fiscalYear}`,
        title:     `${h.candidateFirstName ?? ''} ${h.candidateLastName ?? ''}`.trim() || '—',
        level:     null,
        urgency:   itemUrgency('hiring', null),
        dateLabel: formatDate(h.submittedAt),
        amountLabel: this.currency.transform(annual, cur),
        sortDate:   h.submittedAt,
        sortAmount: annual,
        metrics: [
          { label: t('COST.APPROVAL_QUEUE.POSITION'),      value: h.appliedPosition ?? '—' },
          { label: t('COST.APPROVAL_QUEUE.ENTITY'),        value: h.candidateLocation ?? '—' },
          { label: t('COST.APPROVAL_QUEUE.MONTHLY_COST'),  value: this.currency.transform(snap.loadedCost ?? null, cur) },
          { label: t('COST.APPROVAL_QUEUE.ANNUAL_COST'),   value: this.currency.transform(annual, cur) },
        ],
        hiring: h,
      };
    });

    const advanceItems: ApprovalItem[] = this.advances().map(a => {
      const amount = this.advanceAmount(a.amount, a.currency);
      return {
        key:       `advance-${a.id}`,
        kind:      'advance',
        id:        a.id,
        reference: `AVS-${a.id}`,
        title:     a.employeeName ?? '—',
        level:     null,
        urgency:   itemUrgency('advance', null),
        dateLabel: formatDate(a.createdAt),
        amountLabel: amount,
        sortDate:   a.createdAt,
        sortAmount: a.amount,
        metrics: [
          { label: t('FACTURATION.ADVANCES.COL_AMOUNT'), value: amount },
          { label: t('FACTURATION.ADVANCES.COL_TERMS'),
            value: `${this.advanceAmount(a.monthlyAmount, a.currency)} × ${a.installments}` },
          { label: t('FACTURATION.ADVANCES.FIRST_MONTH'), value: this.advanceMonth(a.firstDeductionMonth) },
          { label: t('FACTURATION.ADVANCES.COL_ASKED_ON'), value: formatDate(a.createdAt) },
        ],
        advance: a,
      };
    });

    return [...costItems, ...hiringItems, ...advanceItems];
  });

  /** Search + the filters, all client-side: each queue arrives whole in one call. */
  readonly visibleItems = computed<ApprovalItem[]>(() => {
    const q     = this.searchTerm().toLowerCase().trim();
    const kind  = this.filterKind();
    const prio  = this.filterPriority();
    const level = this.filterLevel();
    const cat   = this.filterCategory();
    const range = this.filterDateRange();
    const from  = range?.length ? toIsoDay(range[0]) : null;
    const to    = range?.length ? toIsoDay(range[range.length - 1]) : null;
    const sub   = this.filterSubCategory();
    const cur   = this.filterCurrency();
    const min   = parseAmount(this.filterAmountMin());
    const max   = parseAmount(this.filterAmountMax());
    return this.items().filter(item => {
      if (kind && item.kind !== kind)     return false;
      if (prio && item.urgency !== prio)  return false;
      if (level && item.level !== level)  return false;
      if (cat && item.cost?.costCategoryId !== +cat) return false;
      if (sub && item.cost?.costSubCategoryId !== +sub) return false;
      if (cur && this.itemCurrency(item) !== cur) return false;
      if (min != null || max != null) {
        const amount = this.itemAmount(item);
        if (amount == null) return false;
        if (min != null && amount < min) return false;
        if (max != null && amount > max) return false;
      }
      if (from && to) {
        const day = (item.kind === 'cost' ? item.cost?.transactionDate : item.hiring?.submittedAt)?.slice(0, 10);
        if (!day || day < from || day > to) return false;
      }
      if (!q) return true;
      return [item.title, item.reference, item.amountLabel]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  });

  /** Levels present on the loaded cost lines — every option matches something. */
  private readonly costLevels = computed(() =>
    [...new Set(this.costs().map(c => c.approvalLevelRequired).filter((l): l is string => !!l))].sort());

  /** Categories present on the loaded cost lines, sorted by label. */
  private readonly costCategories = computed(() => {
    const lang = this.translate.currentLang();
    const seen = new Map<number, string>();
    for (const c of this.costs()) {
      if (c.costCategoryId != null && !seen.has(c.costCategoryId)) {
        seen.set(c.costCategoryId,
          localizedLabel(c.costCategoryLabel, c.costCategoryLabelEn, lang) ?? String(c.costCategoryId));
      }
    }
    return [...seen].map(([value, label]) => ({ value: String(value), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Sub-categories present on the loaded cost lines, sorted by label. */
  private readonly costSubCategories = computed(() => {
    const lang = this.translate.currentLang();
    const seen = new Map<number, string>();
    for (const c of this.costs()) {
      if (c.costSubCategoryId != null && !seen.has(c.costSubCategoryId)) {
        seen.set(c.costSubCategoryId,
          localizedLabel(c.costSubCategoryLabel, c.costSubCategoryLabelEn, lang) ?? String(c.costSubCategoryId));
      }
    }
    return [...seen].map(([value, label]) => ({ value: String(value), label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Currencies present on the loaded items (both queues), sorted. */
  private readonly itemCurrencies = computed(() =>
    [...new Set(this.items().map(i => this.itemCurrency(i)).filter((c): c is string => !!c))].sort());

  /** Original currency of an item — same fallback as its amount label. */
  private itemCurrency(item: ApprovalItem): string | null {
    if (item.kind === 'cost') return item.cost?.currency ?? null;
    return this.hiringSvc.parseSnapshot(item.hiring!.simulationSnapshot).localCurrency ?? 'TND';
  }

  /** The number behind `amountLabel`: EUR net (else local net) for a cost, annual loaded cost for a hiring request. */
  private itemAmount(item: ApprovalItem): number | null {
    if (item.kind === 'cost') return item.cost?.netAmountEur ?? item.cost?.netAmountLocal ?? null;
    const loaded = this.hiringSvc.parseSnapshot(item.hiring!.simulationSnapshot).loadedCost;
    return loaded != null ? loaded * 12 : null;
  }

  readonly pendingCount = computed(() => this.items().length);
  readonly urgentCount  = computed(() => this.items().filter(i => i.urgency === 'urgent').length);

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiPending : MetricCardOptions = { icon: 'pending_actions', iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiUrgent  : MetricCardOptions = {
    icon: 'priority_high', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger',
  };

  /** Says how the total splits between the two queues, which the single number hides. */
  readonly pendingDelta = computed<MetricDelta>(() => {
    this.translate.currentLang();
    const costs    = this.items().filter(i => i.kind === 'cost').length;
    const hiring   = this.items().filter(i => i.kind === 'hiring').length;
    const advances = this.items().filter(i => i.kind === 'advance').length;
    return {
      value: this.translate.instant(
        advances ? 'COST.APPROVAL_QUEUE.SPLIT_WITH_ADVANCES' : 'COST.APPROVAL_QUEUE.SPLIT',
        { costs, hiring, advances }),
      direction: 'neutral',
    };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.LINES.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.LINES.VIEW_LIST') },
    ];
  });

  /**
   * A real filter panel. The old "Filtres" button had no `(onClick)` at all — it opened
   * nothing. Type matters here because the grid mixes two unrelated queues.
   */
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      {
        name: 'kind',
        label: t('COST.APPROVAL_QUEUE.KIND'),
        type: 'select',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_ALL'),
        // Le filtre « Embauches » disparaît pour qui ne peut pas les décider — sinon il
        // filtre sur une file que l'API ne lui rend pas.
        // A kind appears only for who may decide it — otherwise it filters on a queue the
        // API does not return to them.
        options: [
          { value: 'cost', label: t('COST.APPROVAL_QUEUE.KIND_COST') },
          ...(this.canDecideHiring()
            ? [{ value: 'hiring', label: t('COST.APPROVAL_QUEUE.KIND_HIRING') }] : []),
          ...(this.canDecideAdvance()
            ? [{ value: 'advance', label: t('COST.APPROVAL_QUEUE.KIND_ADVANCE') }] : []),
        ],
      },
      {
        name: 'priority',
        label: t('COST.APPROVAL_QUEUE.PRIORITY'),
        type: 'select',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_ALL'),
        options: [
          { value: 'urgent', label: t('COST.URGENCY.URGENT') },
          { value: 'normal', label: t('COST.URGENCY.NORMAL') },
          { value: 'low',    label: t('COST.URGENCY.LOW')    },
        ],
      },
      {
        name: 'level',
        label: t('COST.DETAIL.INFO.APPROVAL_LEVEL'),
        type: 'select',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_ALL'),
        options: this.costLevels().map(l => ({ value: l, label: t(approvalLevelKey(l)!) })),
      },
      {
        name: 'category',
        label: t('COST.LINES.CATEGORY_FILTER_LABEL'),
        type: 'select',
        placeholder: t('COST.LINES.CATEGORY_FILTER_PLACEHOLDER'),
        searchable: true,
        options: this.costCategories(),
      },
      {
        name: 'dateRange',
        label: t('COST.LINES.DATE_RANGE_FILTER_LABEL'),
        type: 'daterange',
      },
      {
        name: 'subCategory',
        label: t('COST.FORM.SUB_CATEGORY_LABEL'),
        type: 'select',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_ALL'),
        searchable: true,
        options: this.costSubCategories(),
      },
      {
        name: 'currency',
        label: t('COST.FORM.CURRENCY_LABEL'),
        type: 'select',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_ALL'),
        options: this.itemCurrencies().map(c => ({ value: c, label: c })),
      },
      {
        name: 'amountMin',
        label: t('COST.APPROVAL_QUEUE.FILTER_AMOUNT_MIN'),
        type: 'text',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_AMOUNT_PH'),
      },
      {
        name: 'amountMax',
        label: t('COST.APPROVAL_QUEUE.FILTER_AMOUNT_MAX'),
        type: 'text',
        placeholder: t('COST.APPROVAL_QUEUE.FILTER_AMOUNT_PH'),
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      title:        t('COST.APPROVAL_QUEUE.FILTERS'),
      applyLabel:   t('COST.LINES.FILTER_APPLY'),
      cancelLabel:  t('COST.LINES.FILTER_CANCEL'),
      resetLabel:   t('COST.LINES.FILTER_RESET'),
      triggerLabel: t('COST.APPROVAL_QUEUE.FILTERS'),
      // Seeded once, in the panel's internal shape — a select is a string[] (§10b).
      initialValues: {
        kind:      this.filterKind()     ? [this.filterKind()]     : [],
        priority:  this.filterPriority() ? [this.filterPriority()] : [],
        level:     this.filterLevel()    ? [this.filterLevel()]    : [],
        category:  this.filterCategory() ? [this.filterCategory()] : [],
        dateRange: this.filterDateRange(),
        subCategory: this.filterSubCategory() ? [this.filterSubCategory()] : [],
        currency:    this.filterCurrency()    ? [this.filterCurrency()]    : [],
        amountMin:   this.filterAmountMin(),
        amountMax:   this.filterAmountMax(),
      },
    };
  });

  readonly decisionOptions = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'approve' as CostDecision, icon: 'check_circle', label: t('COST.APPROVAL_QUEUE.APPROVE')    },
      { id: 'return'  as CostDecision, icon: 'undo',         label: t('COST.APPROVAL_QUEUE.COMPLEMENT') },
      { id: 'reject'  as CostDecision, icon: 'cancel',       label: t('COST.APPROVAL_QUEUE.REJECT')     },
    ];
  });

  readonly hiringDecisionOptions = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { id: 'approve', icon: 'check_circle', label: t('COST.APPROVAL_QUEUE.APPROVE') },
      { id: 'reject',  icon: 'cancel',       label: t('COST.APPROVAL_QUEUE.REJECT')  },
    ];
  });

  readonly commentPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.modalDecision() === 'approve'
      ? 'COST.APPROVAL_QUEUE.COMMENT_OPT_PLACEHOLDER'
      : 'COST.APPROVAL_QUEUE.COMMENT_REJECT_PLACEHOLDER');
  });

  readonly hiringCommentPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.hiringDecision() === 'reject'
      ? 'COST.APPROVAL_QUEUE.COMMENT_REJECT_PLACEHOLDER'
      : 'COST.APPROVAL_QUEUE.COMMENT_OPT_PLACEHOLDER');
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => {
        if (id != null && id > 0) this.paysId.set(id);
        this.loadQueue();
        this.loadHiringQueue();
      },
      error: () => { this.loadQueue(); this.loadHiringQueue(); },
    });
    this.loadAdvances();
  }

  /**
   * Not scoped by `paysId` here: payroll-service filters by the caller's own entity scope.
   */
  loadAdvances(): void {
    if (!this.canDecideAdvance()) return;
    this.advancesLoading.set(true);
    this.advanceSvc.pending().subscribe({
      next: pending => {
        this.advances.set(pending);
        this.advancesLoading.set(false);
      },
      error: err => {
        this.hiringError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('COST.APPROVAL_QUEUE.GENERIC_ERROR'));
        this.advancesLoading.set(false);
      },
    });
  }

  loadQueue(): void {
    this.isLoading.set(true);
    this.svc.getPendingApprovals(this.paysId()).subscribe({
      next:  items => { this.costs.set(items); this.isLoading.set(false); this.firstLoad.set(false); },
      error: ()    => { this.isLoading.set(false); this.firstLoad.set(false); },
    });
  }

  /**
   * Le décideur des embauches, côté RH — `APPROVE_HIRING_COST`, la permission que
   * rh-service exige sur /api/hr/cost-approvals.
   *
   * Sans ce test, un approbateur de lignes de coût voyait l'onglet « Embauches », son
   * compteur et son filtre, pour un appel qui lui renvoyait 403 : une file qui paraît vide
   * alors qu'elle est seulement interdite.
   */
  readonly canDecideHiring = computed(() => this.userStore.hasPermission('APPROVE_HIRING_COST'));

  loadHiringQueue(): void {
    if (!this.canDecideHiring()) return;
    this.hiringLoading.set(true);
    this.hiringError.set(null);
    this.hiringSvc.getPendingByPays(this.paysId()).subscribe({
      next:  items => { this.hiringPending.set(items); this.hiringLoading.set(false); },
      error: err => {
        this.hiringError.set(err?.error?.detail ?? err?.error?.message
          ?? this.translate.instant('COST.APPROVAL_QUEUE.GENERIC_ERROR'));
        this.hiringLoading.set(false);
      },
    });
  }

  applyFilters(result: FilterResult): void {
    this.filterKind.set(((result['kind'] as string | null) ?? '') as '' | ApprovalKind);
    this.filterPriority.set((result['priority'] as string | null) ?? '');
    this.filterLevel.set((result['level'] as string | null) ?? '');
    this.filterCategory.set((result['category'] as string | null) ?? '');
    const range = result['dateRange'] as Date[] | null;
    this.filterDateRange.set(range?.length ? range : null);
    this.filterSubCategory.set((result['subCategory'] as string | null) ?? '');
    this.filterCurrency.set((result['currency'] as string | null) ?? '');
    this.filterAmountMin.set(typeof result['amountMin'] === 'string' ? result['amountMin'] : '');
    this.filterAmountMax.set(typeof result['amountMax'] === 'string' ? result['amountMax'] : '');
  }

  navigateToNew(): void {
    // `..` is /finance/cost, which is the list — a "Nouvelle demande" button has to land
    // on the create form.
    this.router.navigate(['../new'], { relativeTo: this.route });
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  onDecide(event: { item: ApprovalItem; decision: ApprovalDecision }): void {
    const { item, decision } = event;

    // Additive: navigates to the new read-only detail page instead of opening the
    // decision modal. The existing approve/return/reject flow below is untouched --
    // this mirrors the existing 'candidate' branch for hiring items, which likewise
    // window.open()s instead of opening a modal.
    if (decision === 'view' && item.kind === 'cost') {
      this.router.navigate(['..', item.id], { relativeTo: this.route });
      return;
    }

    if (item.kind === 'advance') {
      this.openAdvanceDecisionModal(item.advance!, decision === 'reject' ? 'reject' : 'approve');
      return;
    }

    if (item.kind === 'hiring') {
      if (decision === 'candidate') {
        window.open(`/rh/candidates/${item.hiring!.candidateId}`, '_blank', 'noopener');
        return;
      }
      this.openHiringDecisionModal(item.hiring!, decision === 'reject' ? 'reject' : 'approve');
      return;
    }
    this.openDecisionModal(item.cost!, decision as CostDecision);
  }

  openDecisionModal(cost: CostLineDto, decision: CostDecision): void {
    this.selectedCost.set(cost);
    this.modalDecision.set(decision);
    this.approvalCommentSig.set('');
    this.modalError.set(null);
    const t = (key: string) => this.translate.instant(key);
    this.approvalRef = this.modal.open({
      title: t('COST.APPROVAL_QUEUE.MODAL_TITLE'),
      body:  this.approvalTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('COST.APPROVAL_QUEUE.MODAL_CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: t('COST.APPROVAL_QUEUE.MODAL_CONFIRM'), variant: 'primary',   action: () => this.submitApproval() },
      ],
    });
  }

  submitApproval(): void {
    const cost     = this.selectedCost();
    const decision = this.modalDecision();
    if (!cost) return;

    const comment = this.approvalCommentSig().trim();
    if (decision !== 'approve' && !comment) {
      this.modalError.set(this.translate.instant('COST.APPROVAL_QUEUE.REJECT_COMMENT_REQUIRED'));
      return;
    }

    const level = cost.approvalLevelRequired ?? 'L2';
    this.modalError.set(null);

    // "Complément" now calls the RETURN endpoint. It used to call the approve handler,
    // so pressing it approved the line outright instead of sending it back.
    const call$ =
      decision === 'approve' ? this.svc.approveCostLine(cost.id, level, comment || undefined)
      : decision === 'return' ? this.svc.returnCostLine(cost.id, level, comment)
      :                         this.svc.rejectCostLine(cost.id, level, comment);

    call$.subscribe({
      next: () => { this.approvalRef?.close(); this.loadQueue(); },
      error: err => this.modalError.set(
        err.error?.message ?? this.translate.instant('COST.APPROVAL_QUEUE.GENERIC_ERROR')),
    });
  }

  openHiringDecisionModal(item: HiringCostApprovalDto, decision: 'approve' | 'reject'): void {
    this.selectedHiring.set(item);
    this.hiringDecision.set(decision);
    this.hiringCommentSig.set('');
    this.hiringContrePropSig.set(null);
    this.hiringModalError.set(null);
    const t = (key: string) => this.translate.instant(key);
    this.hiringApprovalRef = this.modal.open({
      title: t('COST.APPROVAL_QUEUE.HIRING_MODAL_TITLE'),
      body:  this.hiringApprovalTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('COST.APPROVAL_QUEUE.MODAL_CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: t('COST.APPROVAL_QUEUE.MODAL_CONFIRM'), variant: 'primary',   action: () => this.submitHiringApproval() },
      ],
    });
  }

  submitHiringApproval(): void {
    const item     = this.selectedHiring();
    const decision = this.hiringDecision();
    if (!item) return;

    const comment = this.hiringCommentSig().trim();
    if (decision === 'reject' && !comment) {
      this.hiringModalError.set(this.translate.instant('COST.APPROVAL_QUEUE.REJECT_COMMENT_REQUIRED'));
      return;
    }

    this.hiringModalError.set(null);
    const contreProp = this.hiringContrePropSig();
    const call$ = decision === 'approve'
      ? this.hiringSvc.approve(item.id, comment || undefined)
      : this.hiringSvc.reject(item.id, comment, contreProp ?? undefined);

    call$.subscribe({
      next: () => {
        this.hiringApprovalRef?.close();
        this.hiringPending.update(list => list.filter(i => i.id !== item.id));
      },
      error: err => this.hiringModalError.set(
        err?.error?.detail ?? err?.error?.message
        ?? this.translate.instant('COST.APPROVAL_QUEUE.GENERIC_ERROR')),
    });
  }

  // ── Salary advances ────────────────────────────────────────────────────────
  openAdvanceDecisionModal(advance: SalaryAdvanceDto, decision: 'approve' | 'reject'): void {
    this.selectedAdvance.set(advance);
    this.advanceDecision.set(decision);
    this.advanceComment.set('');
    this.advanceModalError.set(null);
    const t = (key: string) => this.translate.instant(key);
    this.advanceRef = this.modal.open({
      title: t('FACTURATION.ADVANCES.DECISION_TITLE'),
      body:  this.advanceDecisionTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: t('COST.APPROVAL_QUEUE.MODAL_CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: t('COST.APPROVAL_QUEUE.MODAL_CONFIRM'), variant: 'primary',   action: () => this.submitAdvanceDecision() },
      ],
    });
  }

  /** Guarded here as well as server-side: a ModalButton has no reactive `disabled`. */
  submitAdvanceDecision(): void {
    const advance = this.selectedAdvance();
    if (!advance) return;
    const comment = this.advanceComment().trim();
    if (this.advanceDecision() === 'reject' && !comment) {
      this.advanceModalError.set(this.translate.instant('COST.APPROVAL_QUEUE.REJECT_COMMENT_REQUIRED'));
      return;
    }
    this.advanceModalError.set(null);
    const call$ = this.advanceDecision() === 'approve'
      ? this.advanceSvc.approve(advance.id, comment || null)
      : this.advanceSvc.reject(advance.id, comment);
    call$.subscribe({
      next: saved => {
        this.advanceRef?.close();
        // Off the queue either way — approved goes to payroll for the payout, rejected is final.
        this.advances.update(list => list.filter(a => a.id !== saved.id));
      },
      error: err => this.advanceModalError.set(
        err?.error?.detail ?? err?.error?.message ?? this.translate.instant('COST.APPROVAL_QUEUE.GENERIC_ERROR')),
    });
  }

  /** The advance's own currency, with that currency's decimals — never converted. */
  advanceAmount(value: number | null | undefined, currency: string | null): string {
    if (value === null || value === undefined) return '—';
    const digits = currencyFractionDigits(currency);
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    const formatted = new Intl.NumberFormat(locale, {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
    return currency ? `${formatted} ${currency}` : formatted;
  }

  advanceMonth(ym: string | null): string {
    if (!ym) return '—';
    const [y, m] = ym.slice(0, 7).split('-').map(Number);
    const locale = this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
  }

  // ── Formatting used by the modal bodies ────────────────────────────────────
  costAmountLabel(cost: CostLineDto): string {
    return cost.netAmountEur != null
      ? this.currency.transform(cost.netAmountEur, 'EUR')
      : this.currency.transform(cost.netAmountLocal, cost.currency ?? 'TND');
  }

  hiringLoadedCostLabel(item: HiringCostApprovalDto): string {
    const snap = this.hiringSvc.parseSnapshot(item.simulationSnapshot);
    return this.currency.transform(snap.loadedCost ?? null, snap.localCurrency ?? 'TND');
  }
}

/** Local calendar day as `YYYY-MM-DD` — never toISOString(), which shifts to UTC. */
function toIsoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Amount bound typed as text ('1 500,50' accepted) → number, or null when empty/invalid. */
function parseAmount(raw: string): number | null {
  // JS `\s` also covers the non-breaking/narrow spaces fr-FR number formatting inserts.
  const s = raw.replace(/\s/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
