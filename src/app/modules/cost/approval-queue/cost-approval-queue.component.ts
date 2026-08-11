import { Component, OnInit, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FilterField, FilterResult, FormFieldComponent, MetricCardComponent,
  MetricCardOptions, MetricDelta, ModalRef, ModalService, PageComponent, PageHeaderComponent,
  SearchToolbarComponent, SearchToolbarFilterConfig, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { UserStore } from '../../../core/user.store';
import { HiringCostApprovalDto, HiringCostApprovalService } from '../hiring-cost-approval.service';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { CostLineDto } from '../cost.model';
import { formatDate, urgencyKey } from '../cost-display';
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

  @ViewChild('approvalTpl')       private approvalTpl!:       TemplateRef<unknown>;
  @ViewChild('hiringApprovalTpl') private hiringApprovalTpl!: TemplateRef<unknown>;
  private approvalRef:       ModalRef | null = null;
  private hiringApprovalRef: ModalRef | null = null;

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
  viewMode       = signal<ViewMode>('grid');

  readonly canApproveCost = computed(() => this.userStore.hasPermission('FACT_APPROVE_COST_L1'));

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
        metrics: [
          { label: t('COST.APPROVAL_QUEUE.POSITION'),      value: h.appliedPosition ?? '—' },
          { label: t('COST.APPROVAL_QUEUE.ENTITY'),        value: h.candidateLocation ?? '—' },
          { label: t('COST.APPROVAL_QUEUE.MONTHLY_COST'),  value: this.currency.transform(snap.loadedCost ?? null, cur) },
          { label: t('COST.APPROVAL_QUEUE.ANNUAL_COST'),   value: this.currency.transform(annual, cur) },
        ],
        hiring: h,
      };
    });

    return [...costItems, ...hiringItems];
  });

  /** Search + the two filters, all client-side: each queue arrives whole in one call. */
  readonly visibleItems = computed<ApprovalItem[]>(() => {
    const q    = this.searchTerm().toLowerCase().trim();
    const kind = this.filterKind();
    const prio = this.filterPriority();
    return this.items().filter(item => {
      if (kind && item.kind !== kind)     return false;
      if (prio && item.urgency !== prio)  return false;
      if (!q) return true;
      return [item.title, item.reference, item.amountLabel]
        .some(v => (v ?? '').toLowerCase().includes(q));
    });
  });

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
    const costs  = this.items().filter(i => i.kind === 'cost').length;
    const hiring = this.items().filter(i => i.kind === 'hiring').length;
    return {
      value: this.translate.instant('COST.APPROVAL_QUEUE.SPLIT', { costs, hiring }),
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
        options: [
          { value: 'cost',   label: t('COST.APPROVAL_QUEUE.KIND_COST')   },
          { value: 'hiring', label: t('COST.APPROVAL_QUEUE.KIND_HIRING') },
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
        kind:     this.filterKind() ? [this.filterKind()] : [],
        priority: this.filterPriority() ? [this.filterPriority()] : [],
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
  }

  loadQueue(): void {
    this.isLoading.set(true);
    this.svc.getPendingApprovals(this.paysId()).subscribe({
      next:  items => { this.costs.set(items); this.isLoading.set(false); this.firstLoad.set(false); },
      error: ()    => { this.isLoading.set(false); this.firstLoad.set(false); },
    });
  }

  loadHiringQueue(): void {
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
  }

  navigateToNew(): void {
    // `..` is /finance/cost, which is the list — a "Nouvelle demande" button has to land
    // on the create form.
    this.router.navigate(['../new'], { relativeTo: this.route });
  }

  // ── Decisions ──────────────────────────────────────────────────────────────
  onDecide(event: { item: ApprovalItem; decision: ApprovalDecision }): void {
    const { item, decision } = event;

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
