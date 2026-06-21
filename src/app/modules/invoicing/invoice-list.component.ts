import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from './invoice.service';
import {
  InvoiceListItem, InvoiceFilter, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS,
} from './invoice.model';
import { PermissionDirective } from '../../shared/permission.directive';
import { StatusBadgeComponent } from '../../shared/status-badge.component';
import { PaymentModalComponent } from './payment-modal.component';

@Component({
  selector: 'app-invoice-list',
  imports: [FormsModule, PermissionDirective, StatusBadgeComponent, PaymentModalComponent],
  templateUrl: './invoice-list.component.html',
  styleUrl:    './invoice-list.component.scss',
})
export class InvoiceListComponent implements OnInit {
  private readonly svc    = inject(InvoiceService);
  private readonly router = inject(Router);

  invoices      = signal<InvoiceListItem[]>([]);
  loading       = signal(false);
  error         = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  actionError   = signal<string | null>(null);

  // Payment modal state
  paymentTarget = signal<InvoiceListItem | null>(null);

  // Approval modal state
  approvalTarget  = signal<InvoiceListItem | null>(null);
  approvalComment = '';
  approvalDecision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE';

  // Filters
  filterStatut   = '';
  filterFrom     = '';
  filterTo       = '';
  searchText     = '';
  readonly PAGE_SIZE = 20;

  readonly statutOptions = Object.entries(INVOICE_STATUT_CONFIG)
    .map(([k, v]) => ({ value: k, label: v.label }));

  // Stats computed from current page data
  readonly statsEnAttente = computed(() =>
    this.invoices().filter(i => ['EMITTED', 'SENT', 'PARTIALLY_PAID'].includes(i.statut)).length
  );
  readonly statsEnRetard = computed(() =>
    this.invoices().filter(i => this.isOverdue(i)).length
  );
  readonly statsEnLitige = computed(() =>
    this.invoices().filter(i => i.statut === 'DISPUTED').length
  );
  readonly statsMontantTotal = computed(() =>
    this.invoices().reduce((s, i) => s + i.montantTtc, 0)
  );

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: InvoiceFilter = {
      page: this.currentPage(),
      size: this.PAGE_SIZE,
      statut: this.filterStatut || null,
      from:   this.filterFrom   || null,
      to:     this.filterTo     || null,
      search: this.searchText.trim() || null,
    };
    this.svc.getInvoices(filter).subscribe({
      next: res => {
        this.invoices.set(res.content);
        this.totalElements.set(res.totalElements);
        this.totalPages.set(res.totalPages);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Impossible de charger les factures.');
        this.loading.set(false);
      },
    });
  }

  onSearch():       void { this.currentPage.set(0); this.load(); }
  onFilterChange(): void { this.currentPage.set(0); this.load(); }
  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.currentPage.set(p);
    this.load();
  }

  // ── Overdue ───────────────────────────────────────────────────────────────

  isOverdue(item: InvoiceListItem): boolean {
    if (!OVERDUE_STATUTS.has(item.statut)) return false;
    if (!item.dateEcheance) return false;
    return new Date(item.dateEcheance) < new Date();
  }

  overdueDays(item: InvoiceListItem): number {
    if (!item.dateEcheance) return 0;
    return Math.floor((Date.now() - new Date(item.dateEcheance).getTime()) / 86_400_000);
  }

  // ── Navigation ────────────────────────────────────────────────────────────

  navigateToDetail(id: number): void { this.router.navigate(['/fact/invoicing', id]); }
  navigateToNew():               void { this.router.navigate(['/fact/invoicing/new']); }
  navigateTo(path: string):      void { this.router.navigate([path]); }

  quickEmit(item: InvoiceListItem, e: Event): void {
    e.stopPropagation();
    this.actionError.set(null);
    this.svc.emit(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de l\'émission.'),
    });
  }

  quickMarkSent(item: InvoiceListItem, e: Event): void {
    e.stopPropagation();
    this.actionError.set(null);
    this.svc.markSent(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors du marquage.'),
    });
  }

  openPaymentModal(item: InvoiceListItem, e: Event): void {
    e.stopPropagation();
    this.paymentTarget.set(item);
  }

  onPaymentDone(saved: boolean): void {
    this.paymentTarget.set(null);
    if (saved) this.load();
  }

  openApprovalModal(item: InvoiceListItem, e: Event): void {
    e.stopPropagation();
    this.approvalTarget.set(item);
    this.approvalDecision = 'APPROVE';
    this.approvalComment = '';
  }

  submitApproval(): void {
    const item = this.approvalTarget();
    if (!item) return;
    this.svc.approve(item.id, {
      decision: this.approvalDecision,
      comment:  this.approvalComment.trim() || null,
    }).subscribe({
      next:  () => { this.approvalTarget.set(null); this.load(); },
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de l\'approbation.'),
    });
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  statutConfig(s: string) {
    return INVOICE_STATUT_CONFIG[s] ?? { label: s, bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' };
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

  get pages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const start = Math.max(0, cur - 2), end = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
