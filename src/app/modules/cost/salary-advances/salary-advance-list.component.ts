import { Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, BadgeVariant, ButtonComponent, DafCellDirective, DataTableComponent, EntityCardAction,
  EntityCardComponent, EntityCardOptions, FileUploadComponent, FilterField,
  FilterResult, MetricCardComponent, MetricCardOptions, ModalRef, ModalService, PageComponent,
  PageHeaderComponent, SearchToolbarComponent, SearchToolbarFilterConfig, SectionCardComponent,
  SkeletonComponent, StatusBadgeComponent, TableColumn, TableConfig, TableRow, ToolbarToggleOption, UploadedFile,
} from '@khalilrebhiitec/daf360';

import { ToastService } from '../../../core/toast.service';
import { UserStore } from '../../../core/user.store';
import { currencyFractionDigits } from '../../../shared/currency-decimals.util';
import { TableActionComponent } from '../../../shared/table-action.component';
import { tableTools } from '../../../shared/table-tools';
import { initials } from '../cost-display';
import {
  ADVANCE_STATUSES, AdvanceStatus, SalaryAdvanceApprovalService, SalaryAdvanceDto,
} from './salary-advance-approval.service';
import { SalaryAdvanceDecisionModalComponent } from './salary-advance-decision-modal.component';

/** What payroll-service accepts for the signed contract (SalaryAdvanceService.CONTRACT_TYPES). */
const ACCEPTED_CONTRACT = /\.(pdf|jpe?g|png)$/i;

const STATUS_VARIANT: Record<AdvanceStatus, BadgeVariant> = {
  PENDING_DIRECTOR: 'warning', PENDING_FINANCE: 'warning', APPROVED: 'info',
  REPAYING: 'success', REPAID: 'neutral', REJECTED: 'danger', CANCELLED: 'neutral',
};

/**
 * `/finance/cost/salary-advances` — the « Avances sur salaire » section of the spec (§4–6).
 *
 * Every advance of the caller's scope, whatever its status. From one advance's detail the
 * right desk can:
 *  - decide it (the shared decision modal — director step above the threshold, or the DAF's
 *    final terms);
 *  - open the generated debt contract, regenerate it after an RH outage;
 *  - upload the signed, legalised contract — archived by RH in the employee's folder, which
 *    unblocks payroll's payout.
 *
 * Each action is a PERMISSION, never a role. The page itself opens to any of the four codes
 * (route guard); the actions show only for the code the server checks.
 */
@Component({
  selector: 'app-salary-advance-list',
  standalone: true,
  imports: [
    TranslatePipe, PageComponent, PageHeaderComponent, MetricCardComponent, SearchToolbarComponent,
    DataTableComponent, DafCellDirective, TableActionComponent, SectionCardComponent, ButtonComponent,
    FileUploadComponent, StatusBadgeComponent, SalaryAdvanceDecisionModalComponent,
    EntityCardComponent, SkeletonComponent,
  ],
  host: { class: 'block' },
  templateUrl: './salary-advance-list.component.html',
})
export class SalaryAdvanceListComponent implements OnInit {
  private readonly svc = inject(SalaryAdvanceApprovalService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly userStore = inject(UserStore);
  private readonly toast = inject(ToastService);

  readonly table = viewChild(DataTableComponent);
  private readonly detailTpl = viewChild.required<TemplateRef<unknown>>('detailTpl');
  private detailRef: ModalRef | null = null;

  // ── Data ─────────────────────────────────────────────────────────────────
  readonly advances = signal<SalaryAdvanceDto[]>([]);
  readonly firstLoad = signal(true);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  // ── View state ───────────────────────────────────────────────────────────
  readonly search = signal('');
  readonly filters = signal<FilterResult>({});
  /** Cards by default, like the two approval queues next door; the table is the second view. */
  readonly viewMode = signal<'grid' | 'list'>('grid');

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.LINES.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.LINES.VIEW_LIST') },
    ];
  });

  protected readonly skeletonSlots = [0, 1, 2, 3, 4, 5];

  // ── Detail ───────────────────────────────────────────────────────────────
  readonly selected = signal<SalaryAdvanceDto | null>(null);
  readonly uploadFiles = signal<UploadedFile[]>([]);
  readonly busy = signal(false);
  readonly detailError = signal<string | null>(null);
  /** The advance being decided — mounts the shared decision modal. */
  readonly deciding = signal<{ advance: SalaryAdvanceDto; decision: 'approve' | 'reject' } | null>(null);

  // ── Permissions (the codes payroll-service checks) ───────────────────────
  readonly canDecide = computed(() => this.userStore.hasPermission('FACT_APPROVE_SALARY_ADVANCE'));
  readonly canValidate = computed(() =>
    this.userStore.hasPermission('FACT_VALIDATE_SALARY_ADVANCE_ABOVE_THRESHOLD'));

  readonly kpiToDecide: MetricCardOptions = { icon: 'pending_actions', iconColor: 'text-warning', iconBg: 'bg-warning/10' };
  readonly kpiToSign: MetricCardOptions = { icon: 'contract_edit', iconColor: 'text-info', iconBg: 'bg-info/10' };
  readonly kpiRepaying: MetricCardOptions = { icon: 'event_repeat', iconColor: 'text-success', iconBg: 'bg-success/10' };

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    if (!this.firstLoad()) this.loading.set(true);
    this.error.set(null);
    this.svc.list().subscribe({
      next: list => {
        this.advances.set(list);
        this.loading.set(false);
        this.firstLoad.set(false);
      },
      error: err => {
        this.error.set(this.message(err));
        this.loading.set(false);
        this.firstLoad.set(false);
      },
    });
  }

  // ── KPIs ─────────────────────────────────────────────────────────────────
  readonly stats = computed(() => {
    const list = this.advances();
    return {
      toDecide: list.filter(a => a.status === 'PENDING_DIRECTOR' || a.status === 'PENDING_FINANCE').length,
      toSign: list.filter(a => a.contractStatus === 'TO_SIGN'
        && (a.status === 'APPROVED' || a.status === 'REPAYING')).length,
      repaying: list.filter(a => a.status === 'REPAYING').length,
    };
  });

  // ── Toolbar ──────────────────────────────────────────────────────────────
  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const all = t('FACTURATION.ADVANCES.FILTER_ALL');
    return [
      {
        name: 'status', label: t('FACTURATION.ADVANCES.COL_STATUS'), type: 'select', placeholder: all,
        options: ADVANCE_STATUSES.map(s => ({ value: s, label: t('FACTURATION.ADVANCES.STATUS.' + s) })),
      },
      {
        name: 'contract', label: t('FACTURATION.ADVANCES.COL_CONTRACT'), type: 'select', placeholder: all,
        options: [
          { value: 'TO_SIGN', label: t('FACTURATION.ADVANCES.CONTRACT.TO_SIGN') },
          { value: 'SIGNED',  label: t('FACTURATION.ADVANCES.CONTRACT.SIGNED') },
        ],
      },
      {
        name: 'currency', label: t('FACTURATION.ADVANCES.COL_CURRENCY'), type: 'select', placeholder: all,
        options: [...new Set(this.advances().map(a => a.currency))].sort().map(c => ({ value: c, label: c })),
      },
    ];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    return {
      title: t('FACTURATION.ADVANCES.FILTER_TITLE'),
      triggerLabel: t('FACTURATION.ADVANCES.FILTER_TRIGGER'),
      applyLabel: t('FACTURATION.ADVANCES.FILTER_APPLY'),
      cancelLabel: t('FACTURATION.ADVANCES.FILTER_CANCEL'),
      resetLabel: t('FACTURATION.ADVANCES.FILTER_RESET'),
      align: 'right',
    };
  });

  private pick(name: string): string {
    const v = this.filters()[name];
    if (Array.isArray(v)) return (v[0] as string) ?? '';
    return typeof v === 'string' ? v : '';
  }

  readonly visible = computed(() => {
    const q = this.search().trim().toLowerCase();
    const status = this.pick('status');
    const contract = this.pick('contract');
    const currency = this.pick('currency');
    return this.advances().filter(a =>
      (!q || (a.employeeName ?? '').toLowerCase().includes(q) || ('avs-' + a.id).includes(q))
      && (!status || a.status === status)
      && (!contract || a.contractStatus === contract)
      && (!currency || a.currency === currency));
  });

  // ── Table ────────────────────────────────────────────────────────────────
  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant(k);
    const src = (row: TableRow) => row['_source'] as SalaryAdvanceDto;
    return [
      { key: 'employee', label: t('FACTURATION.ADVANCES.COL_EMPLOYEE'), type: 'avatar', sortable: true },
      { key: 'status',   label: t('FACTURATION.ADVANCES.COL_STATUS'), type: 'badge', sortable: true },
      { key: 'amount',   label: t('FACTURATION.ADVANCES.COL_AMOUNT'), align: 'right', sortable: true,
        sortAccessor: row => src(row).amount },
      { key: 'terms',    label: t('FACTURATION.ADVANCES.COL_TERMS'), sortable: true,
        sortAccessor: row => src(row).firstDeductionMonth ?? '' },
      { key: 'contract', label: t('FACTURATION.ADVANCES.COL_CONTRACT'), type: 'badge', sortable: true },
      // An explicit width: tableTools() turns on the fixed layout, where '1%' is a few pixels.
      { key: '_actions', label: '', align: 'right', width: '6.5rem' },
    ];
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    return this.visible().map(a => ({
      id: a.id,
      employee: {
        name: a.employeeName ?? '—', initials: initials(a.employeeName ?? '—'),
        subtitle: 'AVS-' + a.id + ' · ' + this.date(a.createdAt),
      },
      status: {
        label: t('FACTURATION.ADVANCES.STATUS.' + a.status),
        options: { variant: STATUS_VARIANT[a.status] ?? 'neutral', size: 'sm', dot: true },
      } satisfies BadgeCell,
      amount: this.granted(a) && a.amount !== a.requestedAmount
        ? this.money(a.requestedAmount, a.currency) + ' → ' + this.money(a.amount, a.currency)
        : this.money(a.amount, a.currency),
      terms: this.granted(a)
        ? t('FACTURATION.ADVANCES.TERMS', {
            monthly: this.money(a.monthlyAmount, a.currency), count: a.installments,
            month: this.month(a.firstDeductionMonth) })
        : t('FACTURATION.ADVANCES.ASKED', {
            months: a.requestedInstallments, date: this.date(a.requestedAvailabilityDate) }),
      contract: a.contractStatus ? {
        label: t('FACTURATION.ADVANCES.CONTRACT.' + a.contractStatus),
        options: { variant: a.contractStatus === 'SIGNED' ? 'success' : 'info', size: 'sm' },
      } satisfies BadgeCell : { label: '—', options: { variant: 'neutral', size: 'sm' } } satisfies BadgeCell,
      _source: a,
    }));
  });

  /** Card view: same daf-entity-card grid as /finance/cost/approval and /finance/cost/missions. */
  readonly cards = computed<{ key: number; advance: SalaryAdvanceDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (k: string, p?: object) => this.translate.instant(k, p);
    return this.visible().map(a => {
      const actions: EntityCardAction[] = [];
      if (this.canAct(a)) actions.push({ id: 'decide', icon: 'gavel', tooltip: t('FACTURATION.ADVANCES.DECIDE') });
      actions.push({ id: 'detail', icon: 'visibility', tooltip: t('FACTURATION.ADVANCES.DETAIL') });
      const done = a.status === 'REPAID' || a.status === 'REJECTED' || a.status === 'CANCELLED';
      return {
        key: a.id,
        advance: a,
        options: {
          variant: 'glass',
          clickable: false,
          image: { initials: initials(a.employeeName ?? '—') },
          metadata: {
            title: a.employeeName ?? '—',
            subtitle: 'AVS-' + a.id + ' · ' + this.date(a.createdAt),
            status: this.canAct(a) ? 'pending' : done ? 'inactive' : 'active',
            statusLabel: t('FACTURATION.ADVANCES.STATUS.' + a.status),
          },
          metricsColumns: 2,
          metrics: [
            { label: t(this.granted(a) ? 'FACTURATION.ADVANCES.GRANTED_AMOUNT' : 'FACTURATION.ADVANCES.REQUESTED_AMOUNT'),
              value: this.money(this.granted(a) ? a.amount : a.requestedAmount, a.currency) },
            this.granted(a)
              ? { label: t('FACTURATION.ADVANCES.COL_TERMS'),
                  value: this.money(a.monthlyAmount, a.currency) + ' × ' + a.installments }
              : { label: t('FACTURATION.ADVANCES.COL_MONTHS'),
                  value: t('FACTURATION.ADVANCES.N_MONTHS', { count: a.requestedInstallments }) },
            this.granted(a)
              ? { label: t('FACTURATION.ADVANCES.FIRST_DEDUCTION'), value: this.month(a.firstDeductionMonth) }
              : { label: t('FACTURATION.ADVANCES.COL_AVAILABILITY'), value: this.date(a.requestedAvailabilityDate) },
            { label: t('FACTURATION.ADVANCES.COL_CONTRACT'),
              value: a.contractStatus ? t('FACTURATION.ADVANCES.CONTRACT.' + a.contractStatus) : '—' },
          ],
          actions,
        } satisfies EntityCardOptions,
      };
    });
  });

  onCardAction(a: SalaryAdvanceDto, id: string): void {
    if (id === 'decide') this.decide(a);
    else this.openDetail(a);
  }

  readonly tableConfig = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable: true,
    loading: this.loading(),
    skeletonRows: 6,
    emptyMessage: this.translate.instant('FACTURATION.ADVANCES.EMPTY'),
    ...tableTools(this.translate),
  }));

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    return {
      detail: this.translate.instant('FACTURATION.ADVANCES.DETAIL'),
      decide: this.translate.instant('FACTURATION.ADVANCES.DECIDE'),
    };
  });

  /** The decision this caller may take now — the permission matching the step. */
  canAct(a: SalaryAdvanceDto): boolean {
    return (a.status === 'PENDING_DIRECTOR' && this.canValidate())
        || (a.status === 'PENDING_FINANCE' && this.canDecide());
  }

  // ── Detail ───────────────────────────────────────────────────────────────
  openDetail(a: SalaryAdvanceDto): void {
    this.selected.set(a);
    this.uploadFiles.set([]);
    this.detailError.set(null);
    // The list rows carry no history: the detail call does.
    this.svc.get(a.id).subscribe({ next: full => this.selected.set(full), error: () => {} });
    const t = (k: string) => this.translate.instant(k);
    this.detailRef = this.modal.open({
      title: a.employeeName ?? 'AVS-' + a.id,
      subtitle: 'AVS-' + a.id + ' · ' + t('FACTURATION.ADVANCES.STATUS.' + a.status),
      icon: 'payments',
      body: this.detailTpl(),
      size: 'lg',
      resizable: true,
      maximizable: true,
      buttons: [{ label: t('FACTURATION.ADVANCES.CLOSE'), variant: 'secondary', action: r => r.close() }],
    });
  }

  decide(a: SalaryAdvanceDto, decision: 'approve' | 'reject' = 'approve'): void {
    this.detailRef?.close();
    this.deciding.set({ advance: a, decision });
  }

  onDecided(saved: SalaryAdvanceDto): void {
    this.deciding.set(null);
    this.replace(saved);
  }

  openContract(a: SalaryAdvanceDto, signed: boolean): void {
    this.svc.contract(a.id, signed).subscribe({
      next: blob => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      },
      // responseType 'blob': the ProblemDetail arrives as a Blob, read it for its message.
      error: err => this.blobMessage(err).then(msg => this.toast.error(msg)),
    });
  }

  regenerate(a: SalaryAdvanceDto): void {
    if (this.busy()) return;
    this.busy.set(true);
    this.svc.generateContract(a.id).subscribe({
      next: saved => {
        this.busy.set(false);
        this.replace(saved);
        this.toast.success(this.translate.instant('FACTURATION.ADVANCES.CONTRACT_DONE'));
      },
      error: err => { this.busy.set(false); this.toast.error(this.message(err)); },
    });
  }

  /**
   * The drop zone's `accept` only filters the browse dialog — a drag-and-drop lets any file
   * through. Refused here, at once, with a toast, instead of a server round trip.
   */
  onFilesPicked(files: UploadedFile[]): void {
    const kept: UploadedFile[] = [];
    for (const f of files) {
      if (!ACCEPTED_CONTRACT.test(f.name)) {
        this.toast.error(this.translate.instant('FACTURATION.ADVANCES.UPLOAD_FORMAT', { name: f.name }));
      } else if (f.size > 10 * 1024 * 1024) {
        this.toast.error(this.translate.instant('FACTURATION.ADVANCES.UPLOAD_TOO_LARGE', { name: f.name }));
      } else {
        kept.push(f);
      }
    }
    this.uploadFiles.set(kept);
  }

  uploadSigned(a: SalaryAdvanceDto): void {
    const file = this.uploadFiles().find(f => !f.error)?.file;
    if (!file) {
      this.toast.warning(this.translate.instant('FACTURATION.ADVANCES.UPLOAD_REQUIRED'));
      return;
    }
    if (this.busy()) return;
    this.busy.set(true);
    this.svc.uploadSignedContract(a.id, file).subscribe({
      next: saved => {
        this.busy.set(false);
        this.uploadFiles.set([]);
        this.replace(saved);
        this.toast.success(this.translate.instant('FACTURATION.ADVANCES.UPLOAD_DONE'));
      },
      error: err => { this.busy.set(false); this.toast.error(this.message(err)); },
    });
  }

  /** A contract can be (re)generated until the signed copy is in. */
  canRegenerate(a: SalaryAdvanceDto): boolean {
    return this.canDecide() && a.contractStatus !== 'SIGNED'
      && (a.status === 'APPROVED' || a.status === 'REPAYING');
  }

  canUploadSigned(a: SalaryAdvanceDto): boolean {
    return this.canDecide() && a.contractStatus === 'TO_SIGN'
      && (a.status === 'APPROVED' || a.status === 'REPAYING' || a.status === 'REPAID');
  }

  private replace(saved: SalaryAdvanceDto): void {
    this.advances.update(list => list.map(x => (x.id === saved.id ? saved : x)));
    if (this.selected()?.id === saved.id) this.selected.set(saved);
  }

  // ── Formatting ───────────────────────────────────────────────────────────

  /** The DAF has set the final terms (V39). */
  granted(a: SalaryAdvanceDto): boolean {
    return !!a.effectiveDate && (a.status === 'APPROVED' || a.status === 'REPAYING' || a.status === 'REPAID');
  }

  private locale(): string {
    return this.translate.currentLang() === 'en' ? 'en-GB' : 'fr-FR';
  }

  money(value: number | null | undefined, currency: string | null): string {
    if (value === null || value === undefined) return '—';
    const digits = currencyFractionDigits(currency);
    const formatted = new Intl.NumberFormat(this.locale(), {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }).format(value);
    return currency ? formatted + ' ' + currency : formatted;
  }

  month(ym: string | null): string {
    if (!ym) return '—';
    const [y, m] = ym.slice(0, 7).split('-').map(Number);
    return new Date(y, (m || 1) - 1, 1).toLocaleDateString(this.locale(), { month: 'long', year: 'numeric' });
  }

  date(iso: string | null): string {
    if (!iso) return '—';
    const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1).toLocaleDateString(this.locale(), { day: '2-digit', month: 'short', year: 'numeric' });
  }

  statusVariant(status: AdvanceStatus): BadgeVariant {
    return STATUS_VARIANT[status] ?? 'neutral';
  }

  private message(err: unknown): string {
    const body = (err as { error?: { detail?: string; message?: string } } | null)?.error;
    return body?.detail || body?.message || this.translate.instant('FACTURATION.ADVANCES.ERROR');
  }

  private async blobMessage(err: unknown): Promise<string> {
    const body = (err as { error?: unknown } | null)?.error;
    if (body instanceof Blob) {
      try {
        const parsed = JSON.parse(await body.text()) as { detail?: string; message?: string };
        return parsed.detail || parsed.message || this.translate.instant('FACTURATION.ADVANCES.ERROR');
      } catch {
        return this.translate.instant('FACTURATION.ADVANCES.ERROR');
      }
    }
    return this.message(err);
  }
}
