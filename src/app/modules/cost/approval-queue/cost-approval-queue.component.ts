import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { PermissionDirective } from '../../../shared/permission.directive';
import {
  CostLineDto,
  CATEGORY_ICON,
  getUrgencyFromLevel,
  formatAmount,
  COST_STATUS_CONFIG,
  CostLineStatus,
} from '../cost.model';

@Component({
  selector: 'app-cost-approval-queue',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PermissionDirective],
  templateUrl: './cost-approval-queue.component.html',
  styleUrl: './cost-approval-queue.component.scss',
})
export class CostApprovalQueueComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly clientSvc  = inject(ClientService);

  paysId      = signal<number>(0);
  costs       = signal<CostLineDto[]>([]);
  isLoading   = signal(true);
  searchTerm  = signal('');

  // KPI stats
  pendingCount = computed(() => this.costs().length);
  urgentCount  = computed(() =>
    this.costs().filter(c => c.approvalLevelRequired === 'L3' || c.approvalLevelRequired === 'L4').length
  );
  readonly avgHours  = 4.2;
  readonly perfDelta = 12;
  readonly sparkline = [40, 60, 35, 80, 55, 70, 45, 85, 60, 72];

  // Approval modal
  showModal        = signal(false);
  selectedCost     = signal<CostLineDto | null>(null);
  modalDecision    = signal<'approve' | 'reject'>('approve');
  modalComment     = signal('');
  isSubmitting     = signal(false);
  modalError       = signal<string | null>(null);

  readonly CATEGORY_ICON = CATEGORY_ICON;
  readonly getUrgency    = getUrgencyFromLevel;
  readonly formatAmt     = formatAmount;

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => {
        if (id != null && id > 0) this.paysId.set(id);
        this.loadQueue();
      },
      error: () => this.loadQueue(),
    });
  }

  loadQueue(): void {
    this.isLoading.set(true);
    this.svc.getPendingApprovals(this.paysId()).subscribe({
      next: items => {
        this.costs.set(items);
        this.isLoading.set(false);
      },
      error: () => this.isLoading.set(false),
    });
  }

  filteredCosts = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.costs();
    return this.costs().filter(c =>
      (c.reference ?? '').toLowerCase().includes(q) ||
      (c.label ?? '').toLowerCase().includes(q) ||
      String(c.netAmountLocal ?? '').includes(q)
    );
  });

  getCategoryConf(cost: CostLineDto) {
    return CATEGORY_ICON['DEFAULT'];
  }

  openApprove(cost: CostLineDto): void {
    this.selectedCost.set(cost);
    this.modalDecision.set('approve');
    this.modalComment.set('');
    this.modalError.set(null);
    this.showModal.set(true);
  }

  openReject(cost: CostLineDto): void {
    this.selectedCost.set(cost);
    this.modalDecision.set('reject');
    this.modalComment.set('');
    this.modalError.set(null);
    this.showModal.set(true);
  }

  submitApproval(): void {
    const cost     = this.selectedCost();
    const decision = this.modalDecision();
    if (!cost) return;

    if (decision === 'reject' && !this.modalComment().trim()) {
      this.modalError.set('Un commentaire est obligatoire en cas de refus.');
      return;
    }

    const level = cost.approvalLevelRequired ?? 'L2';
    this.isSubmitting.set(true);
    this.modalError.set(null);

    const call$ = decision === 'approve'
      ? this.svc.approveCostLine(cost.id, level, this.modalComment().trim() || undefined)
      : this.svc.rejectCostLine(cost.id, level, this.modalComment().trim());

    call$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.showModal.set(false);
        this.loadQueue();
      },
      error: err => {
        this.isSubmitting.set(false);
        this.modalError.set(err.error?.message ?? 'Une erreur est survenue.');
      },
    });
  }

  statusConfig(status: string) {
    return COST_STATUS_CONFIG[status as CostLineStatus] ?? { label: status, bg: '#f1f5f9', text: '#475569' };
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
