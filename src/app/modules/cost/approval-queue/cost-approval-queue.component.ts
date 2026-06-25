import {
  Component, OnInit, inject, signal, computed, ViewChild, TemplateRef,
} from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { PermissionDirective } from '../../../shared/permission.directive';
import {
  CostLineDto,
  getUrgencyFromLevel,
  formatAmount,
  COST_STATUS_CONFIG,
  CostLineStatus,
} from '../cost.model';
import {
  MetricCardComponent,
  DataTableComponent, DafCellDirective, TableColumn, TableRow, TableConfig,
  ToolbarComponent, ToolbarAction,
  StatusBadgeComponent as DafBadgeComponent, BadgeOptions, BadgeVariant,
  CardComponent,
  FormFieldComponent,
  ModalService, ModalRef,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-approval-queue',
  standalone: true,
  imports: [
    PermissionDirective,
    MetricCardComponent, DataTableComponent, DafCellDirective,
    ToolbarComponent, DafBadgeComponent, CardComponent, FormFieldComponent,
  ],
  templateUrl: './cost-approval-queue.component.html',
  styleUrl: './cost-approval-queue.component.scss',
})
export class CostApprovalQueueComponent implements OnInit {
  private readonly svc       = inject(CostService);
  private readonly clientSvc = inject(ClientService);
  private readonly router    = inject(Router);
  private readonly route     = inject(ActivatedRoute);
  private readonly modal     = inject(ModalService);

  @ViewChild('approvalTpl') approvalTpl!: TemplateRef<any>;
  private approvalRef: ModalRef | null = null;

  paysId    = signal<number>(0);
  costs     = signal<CostLineDto[]>([]);
  isLoading = signal(true);
  searchTerm = signal('');

  pendingCount = computed(() => this.costs().length);
  urgentCount  = computed(() =>
    this.costs().filter(c => c.approvalLevelRequired === 'L3' || c.approvalLevelRequired === 'L4').length
  );
  readonly avgHours  = 4.2;
  readonly perfDelta = 12;

  selectedCost      = signal<CostLineDto | null>(null);
  modalDecision     = signal<'approve' | 'reject'>('approve');
  approvalCommentSig = signal<string | number | null>(null);
  isSubmitting      = signal(false);
  modalError        = signal<string | null>(null);

  readonly formatAmt = formatAmount;
  readonly getUrgency = getUrgencyFromLevel;

  readonly filteredCosts = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.costs();
    return this.costs().filter(c =>
      (c.reference ?? '').toLowerCase().includes(q) ||
      (c.label ?? '').toLowerCase().includes(q) ||
      String(c.netAmountLocal ?? '').includes(q)
    );
  });

  readonly tableColumns: TableColumn[] = [
    { key: 'reference', label: 'Référence',   type: 'custom' },
    { key: 'date',      label: 'Date',        type: 'text' },
    { key: 'amount',    label: 'Montant',     type: 'custom', align: 'right' },
    { key: 'level',     label: 'Priorité',    type: 'custom', align: 'center' },
    { key: '_actions',  label: 'Actions',     type: 'custom', align: 'right', width: '120px' },
  ];

  readonly tableConfig = computed<TableConfig>(() => ({
    hoverable:    true,
    loading:      this.isLoading(),
    emptyMessage: 'Aucune demande en attente.',
    skeletonRows: 5,
  }));

  readonly tableRows = computed(() =>
    this.filteredCosts().map(cost => ({
      id:        cost.id,
      reference: cost.reference ?? `COUT-${cost.id}`,
      label:     cost.label,
      date:      this.fmtDate(cost.transactionDate),
      amount:    formatAmount(
        cost.netAmountEur ?? cost.netAmountLocal,
        cost.netAmountEur != null ? 'EUR' : (cost.currency ?? 'EUR')
      ),
      level:     cost.approvalLevelRequired,
      _urgency:  getUrgencyFromLevel(cost.approvalLevelRequired),
      _raw:      cost,
    }))
  );

  readonly toolbarActions: ToolbarAction[] = [
    { id: 'refresh', icon: 'refresh',   tooltip: 'Rafraîchir', position: 'left' },
    { id: 'new',     label: 'Nouvelle ligne', icon: 'add', position: 'right', variant: 'primary' },
  ];

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
      next:  items => { this.costs.set(items); this.isLoading.set(false); },
      error: ()    => this.isLoading.set(false),
    });
  }

  onToolbarAction(id: string): void {
    if (id === 'refresh') this.loadQueue();
    if (id === 'new') this.router.navigate(['..'], { relativeTo: this.route });
  }

  openApprove(cost: CostLineDto): void { this.openDecisionModal(cost, 'approve'); }
  openReject(cost: CostLineDto):  void { this.openDecisionModal(cost, 'reject'); }

  openDecisionModal(cost: CostLineDto, decision: 'approve' | 'reject'): void {
    this.selectedCost.set(cost);
    this.modalDecision.set(decision);
    this.approvalCommentSig.set(null);
    this.modalError.set(null);
    this.approvalRef = this.modal.open({
      title:           'Décision d\'approbation',
      body:            this.approvalTpl,
      size:            'md',
      closeOnBackdrop: false,
      buttons: [
        { label: 'Annuler',   variant: 'secondary', action: r => r.close() },
        { label: 'Confirmer', variant: 'primary',   action: _r => this.submitApproval() },
      ],
    });
  }

  submitApproval(): void {
    const cost     = this.selectedCost();
    const decision = this.modalDecision();
    if (!cost) return;

    const comment = String(this.approvalCommentSig() ?? '').trim();
    if (decision === 'reject' && !comment) {
      this.modalError.set('Un commentaire est obligatoire en cas de refus.');
      return;
    }

    const level = cost.approvalLevelRequired ?? 'L2';
    this.isSubmitting.set(true);
    this.modalError.set(null);

    const call$ = decision === 'approve'
      ? this.svc.approveCostLine(cost.id, level, comment || undefined)
      : this.svc.rejectCostLine(cost.id, level, comment);

    call$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.approvalRef?.close();
        this.loadQueue();
      },
      error: err => {
        this.isSubmitting.set(false);
        this.modalError.set(err.error?.message ?? 'Une erreur est survenue.');
      },
    });
  }

  urgencyBadgeOptions(level: string | null): BadgeOptions {
    const variantMap: Record<string, BadgeVariant> = {
      L1: 'neutral', L2: 'warning', L3: 'danger', L4: 'danger',
    };
    return { variant: (level ? (variantMap[level] ?? 'neutral') : 'neutral'), pill: true };
  }

  urgencyLabel(level: string | null): string {
    if (!level || level === 'L1') return 'Basse';
    if (level === 'L2') return 'Normal';
    return 'Urgent';
  }

  fmtDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
