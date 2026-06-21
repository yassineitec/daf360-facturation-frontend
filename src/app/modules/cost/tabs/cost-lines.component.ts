import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { CostService } from '../cost.service';
import {
  CostLineDto, CostLineStatus, COST_STATUS_CONFIG, CostCategoryDto,
} from '../cost.model';
import { ClientService } from '../../clients/client.service';

@Component({
  selector: 'app-cost-lines',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './cost-lines.component.html',
  styleUrl: './cost-lines.component.scss',
})
export class CostLinesComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly clientSvc  = inject(ClientService);
  private readonly router     = inject(Router);

  paysId = signal<number>(0);
  lines  = signal<CostLineDto[]>([]);
  total  = signal(0);
  page   = signal(0);
  size   = 25;

  statusFilter = signal<string>('');
  isLoading    = signal(false);
  serverError  = signal<string | null>(null);
  actionError  = signal<string | null>(null);

  categories  = signal<CostCategoryDto[]>([]);
  categoryMap = computed(() => new Map(this.categories().map(c => [c.id, c.labelFr])));

  draftCount    = computed(() => this.lines().filter(l => l.status === 'DRAFT').length);
  pendingCount  = computed(() => this.lines().filter(l => l.status === 'SUBMITTED').length);
  approvedCount = computed(() =>
    this.lines().filter(l => l.status === 'APPROVED' || l.status === 'VALIDATED' || l.status === 'POSTED').length
  );

  readonly statusOptions = Object.entries(COST_STATUS_CONFIG).map(([k, v]) => ({ code: k, label: v.label }));

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.load();
          this.svc.getCategories(paysId).subscribe({
            next: cats => this.categories.set(cats),
            error: () => {},
          });
        } else {
          this.serverError.set('Pays introuvable pour votre compte.');
        }
      },
      error: () => this.serverError.set('Impossible de déterminer le pays.'),
    });
  }

  load(): void {
    if (!this.paysId()) return;
    this.isLoading.set(true);
    this.serverError.set(null);
    this.svc.getCostLines({
      paysId: this.paysId(),
      status: this.statusFilter() || null,
      page: this.page(),
      size: this.size,
    }).subscribe({
      next: page => {
        this.lines.set(page.content);
        this.total.set(page.totalElements);
        this.isLoading.set(false);
      },
      error: err => {
        this.serverError.set(err.error?.message ?? 'Impossible de charger les lignes.');
        this.isLoading.set(false);
      },
    });
  }

  onStatusChange(): void {
    this.page.set(0);
    this.load();
  }

  openCreate(): void {
    this.router.navigate(['/fact/cost/new']);
  }

  openEdit(line: CostLineDto): void {
    this.router.navigate(['/fact/cost', line.id, 'edit']);
  }

  submit(line: CostLineDto, event: Event): void {
    event.stopPropagation();
    this.actionError.set(null);
    this.svc.submitCostLine(line.id).subscribe({
      next: () => this.load(),
      error: err => this.actionError.set(err.error?.message ?? 'Erreur lors de la soumission.'),
    });
  }

  getCategoryLabel(id: number | null): string {
    if (id == null) return '—';
    return this.categoryMap().get(id) ?? `Cat. ${id}`;
  }

  statusConfig(status: string) {
    return COST_STATUS_CONFIG[status as CostLineStatus] ?? { label: status, bg: '#f1f5f9', text: '#475569' };
  }

  get totalPages(): number { return Math.ceil(this.total() / this.size); }
  pageEnd(): number { return Math.min((this.page() + 1) * this.size, this.total()); }

  prevPage(): void {
    if (this.page() > 0) { this.page.update(p => p - 1); this.load(); }
  }

  nextPage(): void {
    if (this.page() < this.totalPages - 1) { this.page.update(p => p + 1); this.load(); }
  }

  canEdit(line: CostLineDto): boolean { return line.status === 'DRAFT' || line.status === 'RETURNED'; }
  canSubmit(line: CostLineDto): boolean { return line.status === 'DRAFT' || line.status === 'RETURNED'; }

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

  formatDate(date: string | null): string {
    if (!date) return '—';
    try {
      return new Date(date).toLocaleDateString('fr-FR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
    } catch { return date; }
  }
}
