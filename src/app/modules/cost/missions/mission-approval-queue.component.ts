import {
  Component, OnInit, TemplateRef, computed, inject, signal, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  FilterField, FilterResult, FormFieldComponent, MetricCardComponent, MetricCardOptions,
  MetricDelta, ModalRef, ModalService, PageComponent, PageHeaderComponent, PageHeaderBadge,
  SearchToolbarComponent, SearchToolbarFilterConfig, SectionCardComponent,
  ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';

import { MissionApprovalService, MissionDto, MissionScope } from './mission-approval.service';
import { currencyFractionDigits } from '../../../shared/currency-decimals.util';
import {
  MissionApprovalItem, MissionUrgency, daysUntil, localeOf, missionAmountLabel,
  missionDate, missionDestination, missionUrgency,
} from './mission-approval-item';
import {
  MissionApprovalCardsSectionComponent, MissionDecisionKind,
} from './sections/mission-approval-cards-section.component';
import {
  MissionApprovalTableSectionComponent,
} from './sections/mission-approval-table-section.component';

type ViewMode = 'grid' | 'list';
/** The two decisions the endpoint supports. `detail` opens the file instead. */
type Decision = 'approve' | 'reject';

/** One label/value line in the read-only detail modal. */
interface DetailRow {
  label: string;
  value: string;
}

/**
 * `/finance/cost/missions` — the final decision on the cost of an ordre de mission.
 *
 * Last step of a process that starts in RH: a manager plans, RH prices and validates,
 * finance decides. A row only reaches here at `PENDING_FINANCE`, so it always carries an
 * expense sheet — RH cannot validate without one (`MISSION_EXPENSES_MISSING`).
 *
 * Built from the same parts as `/finance/cost/approval` (KPI row, `daf-search-toolbar`,
 * card/table sections, a `ModalService` decision modal) so the two finance approval queues
 * read as one screen with two feeds rather than two unrelated pages.
 */
@Component({
  selector: 'app-mission-approval-queue',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, MetricCardComponent,
    SearchToolbarComponent, FormFieldComponent, SectionCardComponent,
    MissionApprovalCardsSectionComponent, MissionApprovalTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './mission-approval-queue.component.html',
})
export class MissionApprovalQueueComponent implements OnInit {
  private readonly svc = inject(MissionApprovalService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);

  private readonly decisionTpl = viewChild.required<TemplateRef<unknown>>('decisionTpl');
  private readonly detailTpl = viewChild.required<TemplateRef<unknown>>('detailTpl');
  private decisionRef: ModalRef | null = null;

  // ── Data ─────────────────────────────────────────────────────────────────
  readonly missions = signal<MissionDto[]>([]);
  readonly firstLoad = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ── View state ───────────────────────────────────────────────────────────
  readonly viewMode = signal<ViewMode>('grid');
  readonly searchTerm = signal('');
  readonly scopeFilter = signal<'' | MissionScope>('');
  readonly urgencyFilter = signal<'' | MissionUrgency>('');

  // ── Decision modal ───────────────────────────────────────────────────────
  readonly selected = signal<MissionApprovalItem | null>(null);
  readonly decision = signal<Decision>('approve');
  readonly comment = signal('');
  readonly modalError = signal<string | null>(null);

  /** Static options — no signal reads, so they never rebuild per change detection. */
  readonly kpiPending: MetricCardOptions =
    { icon: 'pending_actions', iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiUrgent: MetricCardOptions =
    { icon: 'error', iconColor: 'text-danger', iconBg: 'bg-danger/10' };
  readonly kpiInternational: MetricCardOptions =
    { icon: 'public', iconColor: 'text-secondary', iconBg: 'bg-secondary/10' };

  /**
   * Dates and amounts follow the UI language. The formatters default to fr-FR, so without
   * this an English UI printed "14 sept. 2026" under an English label.
   */
  private readonly locale = computed(() => localeOf(this.translate.currentLang()));

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.firstLoad()) this.loading.set(true);
    this.error.set(null);
    this.svc.pending().subscribe({
      next: list => {
        this.missions.set(list);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: err => {
        this.error.set(this.errorMessage(err));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  // ── Mapping ──────────────────────────────────────────────────────────────
  /**
   * The queue mapped onto the one shape both views render. Built here rather than in the
   * sections so the filters, the cards and the table cannot disagree about what a row is.
   */
  readonly items = computed<MissionApprovalItem[]>(() => {
    this.translate.currentLang();
    const t = (key: string, params?: object) => this.translate.instant(key, params);
    const loc = this.locale();

    return this.missions().map(m => {
      const days = daysUntil(m.startDate);
      const amountLabel = missionAmountLabel(m, loc);
      return {
        id: m.id,
        employee: m.employeeName ?? '—',
        title: m.title,
        destination: missionDestination(m),
        scope: m.scope,
        periodLabel: `${missionDate(m.startDate, loc)} → ${missionDate(m.endDate, loc)}`,
        validatedBy: m.hrValidatedByName ?? '—',
        amountLabel,
        amount: m.expenses?.totalEstimatedCost ?? 0,
        urgency: missionUrgency(days),
        metrics: [
          { label: t('FACTURATION.MISSIONS.COL_PERIOD'),
            value: `${missionDate(m.startDate, loc)} → ${missionDate(m.endDate, loc)}` },
          { label: t('FACTURATION.MISSIONS.DURATION'),
            value: t('FACTURATION.MISSIONS.DAYS', { days: m.durationDays }) },
          { label: t('FACTURATION.MISSIONS.COL_TOTAL'), value: amountLabel },
          // Who to call when the sheet looks wrong — the point of showing it on the card.
          { label: t('FACTURATION.MISSIONS.COL_HR'), value: m.hrValidatedByName ?? '—' },
        ],
        mission: m,
      };
    });
  });

  readonly visibleItems = computed(() => {
    const term = this.searchTerm().trim().toLowerCase();
    const scope = this.scopeFilter();
    const urgency = this.urgencyFilter();
    return this.items().filter(i => {
      const matchesTerm = !term
        || i.employee.toLowerCase().includes(term)
        || i.title.toLowerCase().includes(term)
        || i.destination.toLowerCase().includes(term);
      return matchesTerm
        && (!scope || i.scope === scope)
        && (!urgency || i.urgency === urgency);
    });
  });

  readonly emptyMessage = computed(() => {
    this.translate.currentLang();
    const filtered = !!this.searchTerm().trim() || !!this.scopeFilter() || !!this.urgencyFilter();
    return this.translate.instant(filtered
      ? 'FACTURATION.MISSIONS.EMPTY_FILTERED'
      : 'FACTURATION.MISSIONS.EMPTY');
  });

  // ── KPIs ─────────────────────────────────────────────────────────────────
  readonly stats = computed(() => {
    const all = this.items();
    return {
      pending: all.length,
      urgent: all.filter(i => i.urgency === 'urgent').length,
      international: all.filter(i => i.scope === 'INTERNATIONAL').length,
    };
  });

  readonly headerBadges = computed<PageHeaderBadge[]>(() =>
    this.items().length
      ? [{ label: String(this.items().length), variant: 'warning', pill: true }]
      : []);

  readonly urgentDelta = computed<MetricDelta | null>(() => {
    this.translate.currentLang();
    const urgent = this.stats().urgent;
    if (urgent === 0) return null;
    return {
      value: this.translate.instant('FACTURATION.MISSIONS.DELTA_URGENT', { count: urgent }),
      direction: 'down',
    };
  });

  // ── Toolbar ──────────────────────────────────────────────────────────────
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      {
        name: 'scope',
        label: t('FACTURATION.MISSIONS.SCOPE'),
        type: 'select',
        placeholder: t('FACTURATION.MISSIONS.FILTER_ALL'),
        options: [
          { value: 'NATIONAL', label: t('FACTURATION.MISSIONS.SCOPE_NATIONAL') },
          { value: 'INTERNATIONAL', label: t('FACTURATION.MISSIONS.SCOPE_INTERNATIONAL') },
        ],
      },
      {
        name: 'urgency',
        label: t('FACTURATION.MISSIONS.COL_URGENCY'),
        type: 'select',
        placeholder: t('FACTURATION.MISSIONS.FILTER_ALL'),
        options: [
          { value: 'urgent', label: t('FACTURATION.MISSIONS.URGENCY_URGENT') },
          { value: 'soon', label: t('FACTURATION.MISSIONS.URGENCY_SOON') },
          { value: 'normal', label: t('FACTURATION.MISSIONS.URGENCY_NORMAL') },
        ],
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title: t('FACTURATION.MISSIONS.FILTERS_TITLE'),
      applyLabel: t('FACTURATION.MISSIONS.FILTERS_APPLY'),
      cancelLabel: t('FACTURATION.MISSIONS.FILTERS_CANCEL'),
      resetLabel: t('FACTURATION.MISSIONS.FILTERS_RESET'),
      triggerLabel: t('FACTURATION.MISSIONS.FILTERS_TRIGGER'),
      align: 'right',
      // A `select` needs the panel's internal shape — a string[], not a bare string (§10b).
      initialValues: {
        scope: this.scopeFilter() ? [this.scopeFilter()] : [],
        urgency: this.urgencyFilter() ? [this.urgencyFilter()] : [],
      },
    };
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'grid', icon: 'grid_view', tooltip: t('FACTURATION.MISSIONS.VIEW_GRID') },
      { id: 'list', icon: 'view_list', tooltip: t('FACTURATION.MISSIONS.VIEW_LIST') },
    ];
  });

  onSearch(value: string): void {
    if (value === this.searchTerm()) return;   // the toolbar re-emits on blur
    this.searchTerm.set(value ?? '');
  }

  applyFilters(result: FilterResult): void {
    const scope = typeof result['scope'] === 'string' ? result['scope'] : '';
    const urgency = typeof result['urgency'] === 'string' ? result['urgency'] : '';
    this.scopeFilter.set(scope === 'NATIONAL' || scope === 'INTERNATIONAL' ? scope : '');
    this.urgencyFilter.set(
      urgency === 'urgent' || urgency === 'soon' || urgency === 'normal' ? urgency : '');
  }

  setView(mode: string): void {
    this.viewMode.set(mode as ViewMode);
  }

  // ── Decisions ────────────────────────────────────────────────────────────
  onDecide(event: { item: MissionApprovalItem; decision: MissionDecisionKind }): void {
    if (event.decision === 'detail') this.openDetail(event.item);
    else this.openDecision(event.item, event.decision);
  }

  private openDetail(item: MissionApprovalItem): void {
    this.selected.set(item);
    const t = (k: string) => this.translate.instant(k);
    this.modal.open({
      title: item.title,
      subtitle: `${item.employee} · ${item.destination}`,
      icon: 'flight_takeoff',
      body: this.detailTpl(),
      size: 'lg',
      buttons: [{ label: t('FACTURATION.MISSIONS.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  private openDecision(item: MissionApprovalItem, decision: Decision): void {
    this.selected.set(item);
    this.decision.set(decision);
    this.comment.set('');
    this.modalError.set(null);
    const t = (k: string) => this.translate.instant(k);
    this.decisionRef = this.modal.open({
      title: t('FACTURATION.MISSIONS.MODAL_TITLE'),
      icon: 'price_check',
      body: this.decisionTpl(),
      size: 'md',
      // The decision is deliberate: a stray backdrop click must not lose the reason typed.
      closeOnBackdrop: false,
      buttons: [
        { label: t('FACTURATION.MISSIONS.MODAL_CANCEL'), variant: 'secondary', action: r => r.close() },
        { label: t('FACTURATION.MISSIONS.MODAL_CONFIRM'), variant: 'primary', action: () => this.submit() },
      ],
    });
  }

  readonly decisionOptions = computed(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return [
      { id: 'approve', icon: 'check_circle', label: t('FACTURATION.MISSIONS.APPROVE') },
      { id: 'reject', icon: 'block', label: t('FACTURATION.MISSIONS.REJECT') },
    ];
  });

  readonly commentPlaceholder = computed(() => {
    this.translate.currentLang();
    return this.translate.instant(this.decision() === 'reject'
      ? 'FACTURATION.MISSIONS.REASON_PLACEHOLDER'
      : 'FACTURATION.MISSIONS.NOTES_PLACEHOLDER');
  });

  /**
   * The reason is checked here as well as server-side: the modal's confirm button is a
   * lib `ModalButton` with no reactive `disabled`, so the guard has to live in the submit.
   */
  private submit(): void {
    const item = this.selected();
    if (!item) return;
    const comment = this.comment().trim();
    if (this.decision() === 'reject' && !comment) {
      this.modalError.set(this.translate.instant('FACTURATION.MISSIONS.REASON_REQUIRED'));
      return;
    }
    this.modalError.set(null);

    const call = this.decision() === 'approve'
      ? this.svc.approve(item.id, comment || null)
      : this.svc.reject(item.id, comment);

    call.subscribe({
      next: () => {
        this.decisionRef?.close();
        // Off the queue either way — approved or refused, the mission no longer awaits
        // anything from finance. Filtered in place so the list keeps its scroll position.
        this.missions.update(list => list.filter(m => m.id !== item.id));
      },
      error: err => this.modalError.set(this.errorMessage(err)),
    });
  }

  // ── Detail rows ──────────────────────────────────────────────────────────
  readonly planRows = computed<DetailRow[]>(() => {
    const item = this.selected();
    if (!item) return [];
    const m = item.mission;
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    return dropEmpty([
      { label: t('FACTURATION.MISSIONS.EMPLOYEE'), value: m.employeeName },
      { label: t('FACTURATION.MISSIONS.ROLE'), value: m.employeeRoleName },
      { label: t('FACTURATION.MISSIONS.PERIOD'), value: item.periodLabel },
      { label: t('FACTURATION.MISSIONS.DURATION'), value: t('FACTURATION.MISSIONS.DAYS', { days: m.durationDays }) },
      { label: t('FACTURATION.MISSIONS.SCOPE'), value: t(`FACTURATION.MISSIONS.SCOPE_${m.scope}`) },
      { label: t('FACTURATION.MISSIONS.DESTINATION'), value: item.destination },
      { label: t('FACTURATION.MISSIONS.ADDRESS'), value: m.address },
      { label: t('FACTURATION.MISSIONS.RESPONSABLE'), value: m.responsableDisplayName },
      { label: t('FACTURATION.MISSIONS.PLANNED_BY'), value: m.createdByName },
      { label: t('FACTURATION.MISSIONS.COL_HR'), value: m.hrValidatedByName },
    ]);
  });

  readonly expenseRows = computed<DetailRow[]>(() => {
    const e = this.selected()?.mission.expenses;
    if (!e) return [];
    const t = (k: string) => this.translate.instant(k);
    const money = (v: number | null) => (v === null ? null : this.amount(v, e.currency));
    return dropEmpty([
      { label: t('FACTURATION.MISSIONS.ALLOWANCE'), value: money(e.missionAllowance) },
      { label: t('FACTURATION.MISSIONS.LODGING'), value: money(e.lodgingCost) },
      { label: t('FACTURATION.MISSIONS.HOTEL'), value: e.hotelName },
      { label: t('FACTURATION.MISSIONS.RESERVATION'), value: e.reservationNumber },
      { label: t('FACTURATION.MISSIONS.TICKET'), value: e.ticketReference },
      { label: t('FACTURATION.MISSIONS.TICKET_COST'), value: money(e.ticketCost) },
      { label: t('FACTURATION.MISSIONS.VISA'), value: money(e.visaFees) },
      { label: t('FACTURATION.MISSIONS.INSURANCE'), value: money(e.insuranceFees) },
      { label: t('FACTURATION.MISSIONS.OTHER'), value: money(e.otherFees) },
      { label: t('FACTURATION.MISSIONS.ADVANCE'), value: money(e.advanceAmount) },
      { label: t('FACTURATION.MISSIONS.CASH_PICKUP'), value: missionDate(e.cashPickupDate, this.locale()) },
      { label: t('FACTURATION.MISSIONS.DOC_PICKUP'), value: missionDate(e.documentPickupDate, this.locale()) },
    ]);
  });

  private amount(value: number, currency: string | null): string {
    const digits = currencyFractionDigits(currency);
    const formatted = new Intl.NumberFormat(this.locale(), {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
    return currency ? `${formatted} ${currency}` : formatted;
  }

  private errorMessage(err: unknown): string {
    const body = (err as { error?: { message?: string } } | null)?.error;
    return body?.message || this.translate.instant('FACTURATION.MISSIONS.ERROR');
  }
}

/** An absent value is a line that should not exist, not a line printing a dash. */
function dropEmpty(rows: { label: string; value: string | null | undefined }[]): DetailRow[] {
  return rows
    .filter(r => r.value !== null && r.value !== undefined && r.value !== '' && r.value !== '—')
    .map(r => ({ label: r.label, value: r.value as string }));
}
