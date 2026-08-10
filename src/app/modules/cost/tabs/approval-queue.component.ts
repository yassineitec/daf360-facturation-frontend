import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  MetricCardComponent, MetricCardOptions, SearchToolbarComponent,
  ToolbarAction, ToolbarToggleOption,
} from '@khalilrebhiitec/daf360';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { CostLineDto } from '../cost.model';
import { ApproveModalComponent, ApproveAction } from '../modals/approve-modal.component';
import { urgency } from '../cost-display';
import { ApprovalQueueCardsSectionComponent } from './approval-queue-cards-section.component';
import { ApprovalQueueTableSectionComponent } from './approval-queue-table-section.component';

type ViewMode = 'grid' | 'list';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [
    TranslatePipe, MetricCardComponent, SearchToolbarComponent, ApproveModalComponent,
    ApprovalQueueCardsSectionComponent, ApprovalQueueTableSectionComponent,
  ],
  host: { class: 'block' },
  templateUrl: './approval-queue.component.html',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly translate = inject(TranslateService);

  paysId      = signal<number>(0);
  pending     = signal<CostLineDto[]>([]);
  isLoading   = signal(false);
  serverError = signal<string | null>(null);
  searchQuery = signal('');
  viewMode    = signal<ViewMode>('grid');

  urgentCount  = computed(() =>
    this.pending().filter(l => urgency(l.approvalLevelRequired) === 'urgent').length);
  pendingCount = computed(() => this.pending().length);

  modalLine   = signal<CostLineDto | null>(null);
  modalAction = signal<ApproveAction>('approve');
  modalLevel  = signal<string>('L2');

  /** Complete literal Tailwind classes on lib tokens (UI-PLAYBOOK §3/§4). */
  readonly kpiPending : MetricCardOptions = { icon: 'pending_actions', iconColor: 'text-primary', iconBg: 'bg-primary/10' };
  readonly kpiUrgent  : MetricCardOptions = {
    icon: 'priority_high', iconColor: 'text-danger', iconBg: 'bg-danger/10', valueColor: 'text-danger',
  };

  /** Client-side: the queue arrives whole, so there is nothing to re-fetch on search. */
  readonly filteredPending = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.pending();
    return this.pending().filter(l =>
      (l.label ?? '').toLowerCase().includes(q)
      || (l.id?.toString() ?? '').includes(q)
      || (l.netAmountLocal?.toString() ?? '').includes(q),
    );
  });

  readonly viewOptions = computed<ToolbarToggleOption[]>(() => {
    this.translate.currentLang();
    return [
      { id: 'grid', icon: 'grid_view',  tooltip: this.translate.instant('COST.LINES.VIEW_GRID') },
      { id: 'list', icon: 'table_rows', tooltip: this.translate.instant('COST.LINES.VIEW_LIST') },
    ];
  });

  readonly toolbarActions = computed<ToolbarAction[]>(() => {
    this.translate.currentLang();
    return [{
      id: 'refresh',
      icon: 'refresh',
      tooltip: this.translate.instant('COST.QUEUE.REFRESH'),
      position: 'right',
    }];
  });

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
      error: err => {
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.QUEUE.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  onToolbarAction(id: string): void {
    if (id === 'refresh') this.load();
  }

  openModal(line: CostLineDto, action: ApproveAction): void {
    this.modalLine.set(line);
    this.modalAction.set(action);
    this.modalLevel.set(line.approvalLevelRequired ?? 'L2');
  }

  closeModal(): void { this.modalLine.set(null); }
  onResolved(): void { this.modalLine.set(null); this.load(); }
}
