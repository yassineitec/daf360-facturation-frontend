import { Component, OnInit, inject, signal, computed, ViewChild, TemplateRef } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { InvoiceService } from './invoice.service';
import {
  InvoiceListItem, InvoiceFilter, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS,
} from './invoice.model';
import { PermissionDirective } from '../../shared/permission.directive';
import { PaymentModalComponent } from './payment-modal.component';
import {
  MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
  PaginationComponent,
  ToolbarComponent, ToolbarAction,
  SelectComponent, SelectOption,
  DatePickerComponent,
  StatusBadgeComponent as DafBadgeComponent, BadgeOptions, BadgeVariant,
  CardComponent,
  FormFieldComponent,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-invoice-list',
  imports: [
    PermissionDirective, PaymentModalComponent,
    MetricCardComponent, DataTableComponent, DafCellDirective,
    PaginationComponent, ToolbarComponent, SelectComponent, DatePickerComponent,
    DafBadgeComponent, CardComponent, FormFieldComponent,
  ],
  templateUrl: './invoice-list.component.html',
  styleUrl:    './invoice-list.component.scss',
})
export class InvoiceListComponent implements OnInit {
  private readonly svc    = inject(InvoiceService);
  private readonly router = inject(Router);
  private readonly route  = inject(ActivatedRoute);
  private readonly modal  = inject(ModalService);

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
  approvalCommentSig = signal<string | number | null>(null);

  filterStatutSel = signal<string[]>([]);
  filterFrom      = signal<string>('');
  filterTo        = signal<string>('');
  searchText      = signal<string>('');

  readonly PAGE_SIZE = 20;

  readonly statutSelectOptions: SelectOption[] = Object.entries(INVOICE_STATUT_CONFIG)
    .map(([k, v]) => ({ value: k, label: v.label }));

  readonly statsEnAttente = computed(() =>
    this.invoices().filter(i => ['EMITTED', 'SENT', 'PARTIALLY_PAID'].includes(i.statut)).length
  );
  readonly statsEnRetard = computed(() =>
    this.invoices().filter(i => this.isOverdue(i)).length
  );
  readonly statsEnLitige = computed(() =>
    this.invoices().filter(i => i.statut === 'DISPUTED').length
  );

  readonly tableRows = computed(() =>
    this.invoices().map(inv => ({
      id:                  inv.id,
      invoiceNumber:       inv.invoiceNumber,
      affaireRef:          inv.affaireRef,
      clientNom:           inv.clientNom || '—',
      montantTtc:          inv.montantTtc,
      devise:              inv.devise,
      dateEmission:        this.formatDate(inv.dateEmission),
      dateEcheance:        inv.dateEcheance,
      statut:              inv.statut,
      _isOverdue:          this.isOverdue(inv),
      _overdueDays:        this.overdueDays(inv),
      _formattedEcheance:  this.formatDate(inv.dateEcheance),
      _raw:                inv,
    }))
  );

  readonly tableColumns: TableColumn[] = [
    { key: 'invoiceNumber', label: 'N° Facture',  type: 'custom' },
    { key: 'affaireRef',    label: 'Affaire',     type: 'custom' },
    { key: 'clientNom',     label: 'Client',      type: 'text' },
    { key: 'montantTtc',    label: 'Montant TTC', type: 'custom', align: 'right' },
    { key: 'dateEmission',  label: 'Émission',    type: 'text' },
    { key: 'dateEcheance',  label: 'Échéance',    type: 'custom' },
    { key: 'statut',        label: 'Statut',      type: 'custom', align: 'center' },
    { key: '_actions',      label: 'Actions',     type: 'custom', align: 'right', width: '150px' },
  ];

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.loading(),
    emptyMessage: 'Aucune facture trouvée.',
    skeletonRows: 5,
  }));

  readonly toolbarActions: ToolbarAction[] = [
    { id: 'new', label: 'Nouvelle facture', icon: 'add', position: 'right', variant: 'primary' },
  ];

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    const filter: InvoiceFilter = {
      page:   this.currentPage(),
      size:   this.PAGE_SIZE,
      statut: this.filterStatutSel()[0] || null,
      from:   this.filterFrom()         || null,
      to:     this.filterTo()           || null,
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

  onSearch():       void { this.currentPage.set(0); this.load(); }
  onFilterChange(): void { this.currentPage.set(0); this.load(); }

  goToPage(p: number): void {
    if (p < 0 || p >= this.totalPages()) return;
    this.currentPage.set(p);
    this.load();
  }

  onRowClick(row: TableRow): void { this.navigateToDetail(row['id']); }
  onToolbarAction(id: string): void { if (id === 'new') this.navigateToNew(); }

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
    this.approvalCommentSig.set(null);
    this.approvalRef = this.modal.open({
      title: 'Décision de validation',
      body:  this.approvalTpl,
      size:  'md',
      closeOnBackdrop: false,
      buttons: [
        { label: 'Annuler',   variant: 'secondary', action: r => r.close() },
        { label: 'Confirmer', variant: 'primary',   action: _r => this.submitApproval() },
      ],
    });
  }

  submitApproval(): void {
    const item = this.approvalTarget();
    if (!item) return;
    this.svc.approve(item.id, {
      decision: this.approvalDecision,
      comment:  String(this.approvalCommentSig() ?? '').trim() || null,
    }).subscribe({
      next:  () => { this.approvalRef?.close(); this.approvalTarget.set(null); this.load(); },
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors de l\'approbation.'),
    });
  }

  statutLabel(s: string): string {
    return INVOICE_STATUT_CONFIG[s]?.label ?? s;
  }

  statutBadgeOptions(s: string): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      DRAFT:          'neutral',
      SUBMITTED:      'info',
      RETURNED:       'warning',
      APPROVED:       'secondary',
      EMITTED:        'teal',
      SENT:           'success',
      PARTIALLY_PAID: 'warning',
      PAID:           'success',
      DISPUTED:       'danger',
      CANCELLED:      'danger',
      CREDIT_NOTED:   'info',
    };
    return { variant: variantMap[s] ?? 'neutral', pill: true };
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
}
