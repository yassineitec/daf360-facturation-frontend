import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { InvoiceService } from '../invoice.service';
import {
  InvoiceListItem, InvoiceFilter, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS,
} from '../invoice.model';
import { PermissionDirective } from '../../../shared/permission.directive';
import { PaymentModalComponent } from '../payment-modal.component';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  SelectOption, SelectComponent, ModalService, ModalRef,
  CardComponent, ButtonComponent, PaginationComponent,
  MultiDatePickerComponent,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-invoice-list',
  imports: [PermissionDirective, PaymentModalComponent, CardComponent, ButtonComponent, PaginationComponent, TranslatePipe, MultiDatePickerComponent, SelectComponent],
  templateUrl: './invoice-list.component.html',
  styleUrl:    './invoice-list.component.scss',
})
export class InvoiceListComponent implements OnInit {
  private readonly svc       = inject(InvoiceService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);

  @ViewChild('approvalTpl') approvalTpl!: TemplateRef<any>;
  private approvalRef: ModalRef | null = null;

  invoices      = signal<InvoiceListItem[]>([]);
  loading       = signal(false);
  error         = signal<string | null>(null);
  totalElements = signal(0);
  totalPages    = signal(0);
  currentPage   = signal(0);
  actionError   = signal<string | null>(null);

  paymentTarget  = signal<InvoiceListItem | null>(null);
  approvalTarget = signal<InvoiceListItem | null>(null);
  approvalDecision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE';
  approvalCommentSig = signal<string>('');

  filterStatutSel = signal<string[]>([]);
  filterDateRange = signal<Date | Date[] | null>(null);
  searchText      = signal<string>('');

  readonly statutSelectConfig = {
    placeholder: 'Statut',
    multiple: false,
    searchable: false,
    fullWidth: false,
  };

  readonly dateRangeConfig = {
    selectionMode: 'range' as const,
    placeholder: 'Date ou plage de dates',
    allowPastDays: true,
    fullWidth: false,
  };

  readonly PAGE_SIZE = 20;

  readonly statutSelectOptions: SelectOption[] = Object.entries(INVOICE_STATUT_CONFIG)
    .map(([k, v]) => ({ value: k, label: this.translate.instant(v.label) }));

  // ── KPI counts ────────────────────────────────────────────────────────────
  readonly statsEnAttente = computed(() =>
    this.invoices().filter(i => ['EMITTED', 'SENT', 'PARTIALLY_PAID'].includes(i.statut)).length
  );
  readonly statsEnRetard  = computed(() => this.invoices().filter(i => this.isOverdue(i)).length);
  readonly statsEnLitige  = computed(() => this.invoices().filter(i => i.statut === 'DISPUTED').length);

  // ── KPI monetary amounts (summed on current page, same currency assumed) ──
  readonly amountTotal = computed(() =>
    this.invoices().reduce((s, i) => s + (i.montantTtc ?? 0), 0)
  );
  readonly amountEnAttente = computed(() =>
    this.invoices()
      .filter(i => ['EMITTED', 'SENT', 'PARTIALLY_PAID'].includes(i.statut))
      .reduce((s, i) => s + (i.montantTtc ?? 0), 0)
  );
  readonly amountEnRetard = computed(() =>
    this.invoices().filter(i => this.isOverdue(i)).reduce((s, i) => s + (i.montantTtc ?? 0), 0)
  );
  readonly amountEnLitige = computed(() =>
    this.invoices().filter(i => i.statut === 'DISPUTED').reduce((s, i) => s + (i.montantTtc ?? 0), 0)
  );

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const range = this.filterDateRange();
    const dates = Array.isArray(range) ? range : [];
    const from  = dates[0] instanceof Date ? dates[0].toISOString().split('T')[0] : null;
    const to    = dates[1] instanceof Date ? dates[1].toISOString().split('T')[0] : null;
    const filter: InvoiceFilter = {
      page:   this.currentPage(),
      size:   this.PAGE_SIZE,
      statut: this.filterStatutSel()[0] || null,
      from,
      to,
      search: this.searchText().trim()  || null,
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

  onSearch():           void { this.currentPage.set(0); this.load(); }
  onFilterChange():     void { this.currentPage.set(0); this.load(); }
  onDateRangeChange():  void { this.currentPage.set(0); this.load(); }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.currentPage.set(p);
    this.load();
  }

  isOverdue(item: InvoiceListItem): boolean {
    if (!OVERDUE_STATUTS.has(item.statut)) return false;
    if (!item.dateEcheance) return false;
    return new Date(item.dateEcheance) < new Date();
  }

  overdueDays(item: InvoiceListItem): number {
    if (!item.dateEcheance) return 0;
    return Math.floor((Date.now() - new Date(item.dateEcheance).getTime()) / 86_400_000);
  }

  navigateToDetail(id: number): void { this.router.navigate([id],    { relativeTo: this.route }); }
  navigateToNew():               void { this.router.navigate(['new'], { relativeTo: this.route }); }

  quickEmit(item: InvoiceListItem): void {
    this.actionError.set(null);
    this.svc.emit(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de l\'émission.'),
    });
  }

  quickMarkSent(item: InvoiceListItem): void {
    this.actionError.set(null);
    this.svc.markSent(item.id).subscribe({
      next:  () => this.load(),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors du marquage.'),
    });
  }

  openPaymentModal(item: InvoiceListItem): void { this.paymentTarget.set(item); }

  onPaymentDone(saved: boolean): void {
    this.paymentTarget.set(null);
    if (saved) this.load();
  }

  openApprovalModal(item: InvoiceListItem): void {
    this.approvalTarget.set(item);
    this.approvalDecision = 'APPROVE';
    this.approvalCommentSig.set('');
    this.approvalRef = this.modal.open({
      title: this.translate.instant('INVOICING.LIST.APPROVAL.TITLE'),
      body:  this.approvalTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('INVOICING.LIST.APPROVAL.CANCEL'),  variant: 'secondary', action: r => r.close() },
        { label: this.translate.instant('INVOICING.LIST.APPROVAL.CONFIRM'), variant: 'primary',   action: _r => this.submitApproval() },
      ],
    });
  }

  submitApproval(): void {
    const item = this.approvalTarget();
    if (!item) return;
    this.svc.approve(item.id, {
      decision: this.approvalDecision,
      comment:  this.approvalCommentSig().trim() || null,
    }).subscribe({
      next:  () => { this.approvalRef?.close(); this.approvalTarget.set(null); this.load(); },
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de l\'approbation.'),
    });
  }

  statutLabel(s: string): string { return INVOICE_STATUT_CONFIG[s]?.label ?? s; }

  statutBadgeVariant(s: string): string {
    const map: Record<string, string> = {
      DRAFT: 'neutral', SUBMITTED: 'info', RETURNED: 'warning',
      APPROVED: 'secondary', EMITTED: 'teal', SENT: 'success',
      PARTIALLY_PAID: 'warning', PAID: 'success',
      DISPUTED: 'danger', CANCELLED: 'danger', CREDIT_NOTED: 'info',
    };
    return map[s] ?? 'neutral';
  }

  getInputValue(e: Event):  string { return (e.target as HTMLInputElement).value; }
  getSelectValue(e: Event): string { return (e.target as HTMLSelectElement).value; }
  minVal(a: number, b: number): number { return Math.min(a, b); }

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
}
