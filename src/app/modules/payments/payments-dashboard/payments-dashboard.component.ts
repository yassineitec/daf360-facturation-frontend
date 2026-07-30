import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { PaymentService } from '../payment.service';
import {
  PaymentsDashboardStats, AgingRow, AgingFilter, PageResponse,
  agingRowColor,
} from '../payment.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  CardComponent, ButtonComponent, PaginationComponent,
  StatusBadgeComponent, BadgeVariant,
  MultiDatePickerComponent, MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-payments-dashboard',
  imports: [
    FormsModule, PermissionDirective, CardComponent, ButtonComponent, PaginationComponent,
    StatusBadgeComponent, MultiDatePickerComponent, MetricCardComponent,
    DataTableComponent, DafCellDirective, DisplayCurrencyPipe,
  ],
  templateUrl: './payments-dashboard.component.html',
  styleUrl:    './payments-dashboard.component.scss',
})
export class PaymentsDashboardComponent implements OnInit {
  private readonly svc    = inject(PaymentService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);

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
  filterDateRange = signal<Date | Date[] | null>(null);
  overdueOnly     = false;

  readonly dateRangeConfig = {
    selectionMode: 'range' as const,
    placeholder: 'Date ou plage de dates',
    allowPastDays: true,
    fullWidth: false,
  };

  readonly agingRowColor = agingRowColor;

  readonly tableColumns: TableColumn[] = [
    { key: 'clientNom',    label: 'Client',         type: 'custom' },
    { key: 'invoice',      label: 'Facture',        type: 'custom' },
    { key: 'montantTtc',   label: 'Montant TTC',    type: 'custom', align: 'right' },
    { key: 'dateEcheance', label: 'Échéance',       type: 'custom' },
    { key: 'joursRetard',  label: 'Jours retard',   type: 'custom', align: 'right' },
    { key: 'reminder',     label: 'Statut relance', type: 'custom' },
    { key: '_actions',     label: 'Actions',        type: 'custom', align: 'right' },
  ];

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.loadingRows(),
    emptyMessage: 'Aucune facture impayée trouvée.',
    skeletonRows: 5,
  }));

  readonly tableRows = computed<TableRow[]>(() =>
    this.rows().map(row => ({ ...row, _raw: row }))
  );

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
    const range = this.filterDateRange();
    const dates = Array.isArray(range) ? range : [];
    const from  = dates[0] instanceof Date ? dates[0].toISOString().split('T')[0] : null;
    const to    = dates[1] instanceof Date ? dates[1].toISOString().split('T')[0] : null;
    const filter: AgingFilter = {
      page:        this.currentPage(),
      size:        this.PAGE_SIZE,
      affaireId:   this.filterAffaireId ? +this.filterAffaireId : null,
      clientId:    this.filterClientId  ? +this.filterClientId  : null,
      from,
      to,
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

  onFilterChange():    void { this.currentPage.set(0); this.loadRows(); }
  onDateRangeChange(): void { this.currentPage.set(0); this.loadRows(); }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.currentPage.set(p);
    this.loadRows();
  }

  navigateToInvoice(id: number): void {
    this.router.navigate(['../invoicing', id], { relativeTo: this.route });
  }

  onRowClick(row: TableRow): void {
    this.navigateToInvoice((row['_raw'] as AgingRow).invoiceId);
  }

  navigateToReconciliation(): void {
    this.router.navigate(['reconciliation'], { relativeTo: this.route });
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

  retardVariant(joursRetard: number): BadgeVariant {
    if (joursRetard > 60) return 'danger';
    if (joursRetard > 30) return 'warning';
    return 'neutral';
  }

  get pages(): number[] {
    const total = this.totalPages(), cur = this.currentPage();
    const start = Math.max(0, cur - 2), end = Math.min(total - 1, cur + 2);
    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }
}
