import {
  Component, OnInit, inject, signal, computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CostService } from '../cost.service';
import { CostLineDto, CostLineStatus, COST_STATUS_CONFIG } from '../cost.model';
import { CostLineFormComponent } from '../modals/cost-line-form.component';
import { ClientService } from '../../clients/client.service';

@Component({
  selector: 'app-cost-lines',
  standalone: true,
  imports: [CommonModule, FormsModule, CostLineFormComponent],
  templateUrl: './cost-lines.component.html',
  styleUrl: './cost-lines.component.scss',
})
export class CostLinesComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly clientSvc  = inject(ClientService);

  paysId = signal<number>(0);
  lines  = signal<CostLineDto[]>([]);
  total  = signal(0);
  page   = signal(0);
  size   = 25;

  statusFilter = signal<string>('');
  isLoading    = signal(false);
  serverError  = signal<string | null>(null);

  showForm     = signal(false);
  editLine     = signal<CostLineDto | undefined>(undefined);

  actionError  = signal<string | null>(null);

  readonly statusOptions = Object.entries(COST_STATUS_CONFIG).map(([k, v]) => ({ code: k, label: v.label }));

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: paysId => {
        if (paysId != null && paysId > 0) {
          this.paysId.set(paysId);
          this.load();
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
    if (!this.paysId()) return;
    this.editLine.set(undefined);
    this.showForm.set(true);
  }

  openEdit(line: CostLineDto): void {
    if (!this.paysId()) return;
    this.editLine.set(line);
    this.showForm.set(true);
  }

  onSaved(saved: CostLineDto): void {
    this.showForm.set(false);
    this.load();
  }

  submit(line: CostLineDto): void {
    this.actionError.set(null);
    this.svc.submitCostLine(line.id).subscribe({
      next: () => this.load(),
      error: err => this.actionError.set(err.error?.message ?? 'Erreur lors de la soumission.'),
    });
  }

  delete(line: CostLineDto): void {
    // Only DRAFT lines can be deleted; backend enforces
    if (!confirm(`Supprimer la ligne "${line.label}" ?`)) return;
    // No delete endpoint yet — placeholder
    this.actionError.set('La suppression n\'est pas encore disponible.');
  }

  statusConfig(status: string) {
    return COST_STATUS_CONFIG[status as CostLineStatus] ?? { label: status, color: '#94a3b8', bg: '#f1f5f9' };
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
}
