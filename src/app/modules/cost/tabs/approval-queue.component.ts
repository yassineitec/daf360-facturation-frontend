import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import {
  CostLineDto,
} from '../cost.model';
import { ApproveModalComponent, ApproveAction } from '../modals/approve-modal.component';
import { SearchBarComponent } from '../../../shared/search-bar.component';

@Component({
  selector: 'app-approval-queue',
  standalone: true,
  imports: [ApproveModalComponent, SearchBarComponent, TranslatePipe],
  templateUrl: './approval-queue.component.html',
  styleUrl: './approval-queue.component.scss',
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
        this.serverError.set(err.error?.message ?? this.translate.instant('COST.QUEUE.LOAD_ERROR'));
        this.isLoading.set(false);
      },
    });
  }

  openModal(line: CostLineDto, action: ApproveAction): void {
    this.modalLine.set(line);
    this.modalAction.set(action);
    this.modalLevel.set(line.approvalLevelRequired ?? 'L2');
  }

  closeModal():  void { this.modalLine.set(null); }
  onResolved():  void { this.modalLine.set(null); this.load(); }

  urgencyClass(level: string | null): string {
    if (!level || level === 'L1') return 'low';
    if (level === 'L2') return 'normal';
    return 'urgent';
  }

  urgencyLabel(level: string | null): string {
    if (!level || level === 'L1') return this.translate.instant('COST.URGENCY.LOW');
    if (level === 'L2') return this.translate.instant('COST.URGENCY.NORMAL');
    return this.translate.instant('COST.URGENCY.URGENT');
  }

  statusLabel(s: string): string {
    return this.translate.instant('COST.STATUS.' + s);
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

  getInputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }
}
