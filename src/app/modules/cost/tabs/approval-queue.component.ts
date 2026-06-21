import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { CostLineDto, COST_STATUS_CONFIG, CostLineStatus } from '../cost.model';
import { ApproveModalComponent, ApproveAction } from '../modals/approve-modal.component';

type Priority = 'urgent' | 'normal' | 'low';
interface PriorityConfig { label: string; color: string; shadow: string; }

const PRIORITY_MAP: Record<string, Priority> = {
  L4: 'urgent', L3: 'normal', L2: 'low', L1: 'low',
};

const PRIORITY_CONFIG: Record<Priority, PriorityConfig> = {
  urgent: { label: 'Urgent', color: '#BA1A1A', shadow: 'rgba(186,26,26,0.30)' },
  normal: { label: 'Normal', color: '#D97706', shadow: 'rgba(217,119,6,0.30)' },
  low:    { label: 'Basse',  color: '#94A3B8', shadow: 'rgba(148,163,184,0.30)' },
};

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [CommonModule, FormsModule, ApproveModalComponent],
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

  urgentCount = computed(() =>
    this.pending().filter(l => l.approvalLevelRequired === 'L3' || l.approvalLevelRequired === 'L4').length
  );

  modalLine   = signal<CostLineDto | null>(null);
  modalAction = signal<ApproveAction>('approve');
  modalLevel  = signal<string>('L2');

  filteredPending = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    if (!q) return this.pending();
    return this.pending().filter(l =>
      (l.label ?? '').toLowerCase().includes(q) ||
      (l.id?.toString() ?? '').includes(q) ||
      (l.netAmountLocal?.toString() ?? '').includes(q)
    );
  });

  pendingCount = computed(() => this.pending().length);

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
        }
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

  openModal(line: CostLineDto, action: ApproveAction): void {
    this.modalLine.set(line);
    this.modalAction.set(action);
    this.modalLevel.set(line.approvalLevelRequired ?? 'L2');
  }

  closeModal(): void { this.modalLine.set(null); }
  onResolved(): void { this.modalLine.set(null); this.load(); }

  priorityOf(line: CostLineDto): Priority {
    return PRIORITY_MAP[line.approvalLevelRequired ?? ''] ?? 'low';
  }

  priorityCfg(line: CostLineDto): PriorityConfig {
    return PRIORITY_CONFIG[this.priorityOf(line)];
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

  statusConfig(status: string) {
    return COST_STATUS_CONFIG[status as CostLineStatus] ?? { label: status, color: '#94a3b8', bg: '#f1f5f9' };
  }
}
