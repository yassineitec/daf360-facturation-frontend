import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService } from './payment.service';
import {
  PaymentsDashboardStats, AgingRow, AgingFilter, PageResponse,
  agingRowColor,
} from './payment.model';
import { PermissionDirective } from '../../shared/permission.directive';

@Component({
  selector: 'app-payments-dashboard',
  imports: [FormsModule, PermissionDirective],
  templateUrl: './payments-dashboard.component.html',
  styleUrl:    './payments-dashboard.component.scss',
})
export class PaymentsDashboardComponent implements OnInit {
  private readonly svc    = inject(PaymentService);
  private readonly router = inject(Router);

  stats         = signal<PaymentsDashboardStats | null>(null);
  rows          = signal<AgingRow[]>([]);
  loadingStats  = signal(false);
  loadingRows   = signal(false);
  error         = signal<string | null>(null);

  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  readonly PAGE_SIZE = 50;

  // Filters
  filterAffaireId = '';
  filterClientId  = '';
  filterFrom      = '';
  filterTo        = '';
  overdueOnly     = false;

  readonly agingRowColor = agingRowColor;

  ngOnInit(): void {
    this.loadStats();
    this.loadRows();
  }

  loadStats(): void {
    this.loadingStats.set(true);
    this.svc.getStats().subscribe({
      next:  s  => { this.stats.set(s); this.loadingStats.set(false); },
      error: () => this.loadingStats.set(false),
    });
  }

  loadRows(): void {
    this.loadingRows.set(true);
    this.error.set(null);
    const filter: AgingFilter = {
      page:        this.currentPage(),
      size:        this.PAGE_SIZE,
      affaireId:   this.filterAffaireId ? +this.filterAffaireId : null,
      clientId:    this.filterClientId  ? +this.filterClientId  : null,
      from:        this.filterFrom  || null,
      to:          this.filterTo    || null,
      overdueOnly: this.overdueOnly || undefined,
    };
    this.svc.getAgingRows(filter).subscribe({
      next: res => {
        this.rows.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loadingRows.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les factures impayées.');
        this.loadingRows.set(false);
      },
    });
  }

  onFilterChange(): void { this.currentPage.set(0); this.loadRows(); }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.currentPage.set(p);
    this.loadRows();
  }

  navigateToInvoice(id: number): void {
    this.router.navigate(['/fact/invoicing', id]);
  }

  navigateToReconciliation(): void {
    this.router.navigate(['/fact/payments/reconciliation']);
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  reminderLabel(type: string | null): string {
    if (!type) return '—';
    const labels: Record<string, string> = {
      AVANT_ECHEANCE: 'Avant échéance',
      JOUR_ECHEANCE:  'Jour J',
      RELANCE_1:      '1re relance',
      RELANCE_2:      '2e relance',
      RELANCE_3:      '3e relance',
    };
    return labels[type] ?? type;
  }

  get pages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const start = Math.max(0, cur - 2), end = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
