import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import {
  CostLineDto, COST_STATUS_CONFIG, CostLineStatus,
} from '../cost.model';
import { ApproveModalComponent, ApproveAction } from '../modals/approve-modal.component';
import {
  MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
  ToolbarComponent, ToolbarAction,
  StatusBadgeComponent as DafBadgeComponent, BadgeOptions, BadgeVariant,
  CardComponent,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    ApproveModalComponent,
    MetricCardComponent, DataTableComponent, DafCellDirective,
    ToolbarComponent, DafBadgeComponent, CardComponent,
  ],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);

  paysId      = signal<number>(0);
  pending     = signal<CostLineDto[]>([]);
  isLoading   = signal(false);
  serverError = signal<string | null>(null);
  searchQuery = signal('');

  urgentCount  = computed(() =>
    this.pending().filter(l => l.approvalLevelRequired === 'L3' || l.approvalLevelRequired === 'L4').length
  );
  pendingCount = computed(() => this.pending().length);

  modalLine   = signal<CostLineDto | null>(null);
  modalAction = signal<ApproveAction>('approve');
  modalLevel  = signal<string>('L2');

  readonly filteredPending = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.pending();
    return this.pending().filter(l =>
      (l.label ?? '').toLowerCase().includes(q) ||
      (l.id?.toString() ?? '').includes(q) ||
      (l.netAmountLocal?.toString() ?? '').includes(q)
    );
  });

  readonly tableColumns: TableColumn[] = [
    { key: 'label',    label: 'Description', type: 'custom' },
    { key: 'date',     label: 'Date',        type: 'text' },
    { key: 'amount',   label: 'Montant',     type: 'custom', align: 'right' },
    { key: 'status',   label: 'Statut',      type: 'custom', align: 'center' },
    { key: 'level',    label: 'Niveau',      type: 'custom', align: 'center' },
    { key: '_actions', label: 'Actions',     type: 'custom', align: 'right', width: '120px' },
  ];

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    false,
    loading:      this.isLoading(),
    emptyMessage: 'Aucune ligne en attente d\'approbation.',
    skeletonRows: 5,
  }));

  readonly toolbarActions: ToolbarAction[] = [
    { id: 'refresh', icon: 'refresh', tooltip: 'Actualiser', position: 'left' },
  ];

  readonly tableRows = computed(() =>
    this.filteredPending().map(line => ({
      id:        line.id,
      label:     line.label,
      date:      this.formatDate(line.transactionDate),
      amount:    this.formatAmount(line.netAmountLocal, line.currency ?? undefined),
      amountEur: line.netAmountEur ? this.formatAmount(line.netAmountEur, 'EUR') : null,
      status:    line.status,
      level:     line.approvalLevelRequired,
      _isUrgent: line.approvalLevelRequired === 'L3' || line.approvalLevelRequired === 'L4',
      _raw:      line,
    }))
  );

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) this.paysId.set(paysId);
        this.load();
      },
      error: () => this.load(),
    });
  }

  load(): void {
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.getPendingApprovals(this.paysId()).subscribe({
      next: items => { this.pending.set(items); this.isLoading.set(false); },
      error: err  => {
        this.serverError.set(err.error?.message ?? "Impossible de charger la file d'approbation.");
        this.isLoading.set(false);
      },
    });
  }

  onToolbarAction(id: string): void { if (id === 'refresh') this.load(); }

  openModal(line: CostLineDto, action: ApproveAction): void {
    this.modalLine.set(line);
    this.modalAction.set(action);
    this.modalLevel.set(line.approvalLevelRequired ?? 'L2');
  }

  closeModal():   void { this.modalLine.set(null); }
  onResolved():   void { this.modalLine.set(null); this.load(); }

  statusBadgeOptions(s: string): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      DRAFT:     'neutral',
      SUBMITTED: 'info',
      RETURNED:  'warning',
      APPROVED:  'success',
      VALIDATED: 'success',
      POSTED:    'secondary',
      CANCELLED: 'danger',
      REJECTED:  'danger',
    };
    return { variant: variantMap[s] ?? 'neutral', pill: true };
  }

  statusLabel(s: string): string {
    return COST_STATUS_CONFIG[s as CostLineStatus]?.label ?? s;
  }

  approvalBadgeOptions(level: string | null): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      L1: 'neutral', L2: 'info', L3: 'warning', L4: 'danger',
    };
    return { variant: (level ? (variantMap[level] ?? 'neutral') : 'neutral'), pill: true };
  }

  formatAmount(amount: number | null | undefined, currency = 'EUR'): string {
    if (amount == null) return '—';
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency,
        minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(amount);
    } catch { return `${amount} ${currency}`; }
  }

  formatDate(date: string | null): string {
    if (!date) return '—';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch { return date; }
  }
}
