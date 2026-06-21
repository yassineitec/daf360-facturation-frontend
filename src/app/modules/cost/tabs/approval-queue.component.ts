import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { CostLineDto, COST_STATUS_CONFIG, CostLineStatus } from '../cost.model';
import { ApproveModalComponent, ApproveAction } from '../modals/approve-modal.component';

interface PendingItem {
  line: CostLineDto;
  showModal: boolean;
  action: ApproveAction;
  level: string;
}

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [CommonModule, ApproveModalComponent],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
})
export class ApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);

  paysId    = signal<number>(0);
  pending   = signal<CostLineDto[]>([]);
  isLoading = signal(false);
  serverError = signal<string | null>(null);

  urgentCount = computed(() =>
    this.pending().filter(l => l.approvalLevelRequired === 'L3' || l.approvalLevelRequired === 'L4').length
  );

  modalLine   = signal<CostLineDto | null>(null);
  modalAction = signal<ApproveAction>('approve');
  modalLevel  = signal<string>('L2');

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
      next: items => {
        this.pending.set(items);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Impossible de charger la file d\'approbation.');
        this.isLoading.set(false);
      },
    });
  }

  openModal(line: CostLineDto, action: ApproveAction): void {
    this.modalLine.set(line);
    this.modalAction.set(action);
    this.modalLevel.set(line.approvalLevelRequired ?? 'L2');
  }

  closeModal(): void {
    this.modalLine.set(null);
  }

  onResolved(updated: CostLineDto): void {
    this.modalLine.set(null);
    this.load();
  }

  statusConfig(status: string) {
    return COST_STATUS_CONFIG[status as CostLineStatus] ?? { label: status, color: '#94a3b8', bg: '#f1f5f9' };
  }

  formatAmount(amount: number | null | undefined, currency = 'EUR'): string {
    if (amount == null) return '—';
    try {
      return new Intl.NumberFormat('fr-FR', {
        style: 'currency', currency,
        minimumFractionDigits: 0, maximumFractionDigits: 0,
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }
}
