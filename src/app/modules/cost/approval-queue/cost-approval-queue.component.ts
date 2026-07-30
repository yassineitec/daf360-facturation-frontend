import {
  Component, OnInit, inject, signal, computed, ViewChild, TemplateRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { CostService } from '../cost.service';
import { ClientService } from '../../clients/client.service';
import { HiringCostApprovalService, HiringCostApprovalDto } from '../hiring-cost-approval.service';
import { PermissionDirective } from '../../../shared/permission.directive';
import { SearchBarComponent } from '../../../shared/search-bar.component';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { CostLineDto } from '../cost.model';
import { ModalService, ModalRef, BadgeOptions, ButtonComponent, CardComponent, StatusBadgeComponent, FormFieldComponent } from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-cost-approval-queue',
  standalone: true,
  imports: [FormsModule, PermissionDirective, SearchBarComponent, ButtonComponent, CardComponent, StatusBadgeComponent, FormFieldComponent, DisplayCurrencyPipe],
  templateUrl: './cost-approval-queue.component.html',
  styleUrl: './cost-approval-queue.component.scss',
})
export class CostApprovalQueueComponent implements OnInit {
  private readonly svc        = inject(CostService);
  private readonly clientSvc  = inject(ClientService);
  private readonly hiringSvc  = inject(HiringCostApprovalService);
  private readonly router     = inject(Router);
  private readonly route      = inject(ActivatedRoute);
  private readonly modal      = inject(ModalService);

  @ViewChild('approvalTpl')        approvalTpl!:        TemplateRef<any>;
  @ViewChild('hiringApprovalTpl')  hiringApprovalTpl!:  TemplateRef<any>;
  private approvalRef:       ModalRef | null = null;
  private hiringApprovalRef: ModalRef | null = null;

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

  selectedCost       = signal<CostLineDto | null>(null);
  modalDecision      = signal<'approve' | 'reject'>('approve');
  approvalCommentSig = signal<string>('');
  isSubmitting       = signal(false);
  modalError         = signal<string | null>(null);

  // ── Hiring section state ──────────────────────────────────────────────────────
  hiringPending   = signal<HiringCostApprovalDto[]>([]);
  hiringLoading   = signal(false);
  hiringError     = signal<string | null>(null);

  selectedHiring        = signal<HiringCostApprovalDto | null>(null);
  hiringDecision        = signal<'approve' | 'reject'>('approve');
  hiringCommentSig      = signal<string>('');
  hiringContrePropSig   = signal<number | null>(null);
  isHiringSubmitting    = signal(false);
  hiringModalError      = signal<string | null>(null);

  readonly filteredCosts = computed(() => {
    const q = this.searchTerm().toLowerCase().trim();
    if (!q) return this.costs();
    return this.costs().filter(c =>
      (c.reference ?? '').toLowerCase().includes(q) ||
      (c.label ?? '').toLowerCase().includes(q) ||
      String(c.netAmountLocal ?? '').includes(q)
    );
  });

  ngOnInit(): void {
    this.clientSvc.getMyPays().subscribe({
      next: id => {
        if (id != null && id > 0) this.paysId.set(id);
        this.loadQueue();
        this.loadHiringQueue();
      },
      error: () => { this.loadQueue(); this.loadHiringQueue(); },
    });
  }

  loadQueue(): void {
    this.isLoading.set(true);
    this.svc.getPendingApprovals(this.paysId()).subscribe({
      next:  items => { this.costs.set(items); this.isLoading.set(false); },
      error: ()    => this.isLoading.set(false),
    });
  }

  loadHiringQueue(): void {
    this.hiringLoading.set(true);
    this.hiringError.set(null);
    this.hiringSvc.getPendingByPays(this.paysId()).subscribe({
      next:  items => { this.hiringPending.set(items); this.hiringLoading.set(false); },
      error: err   => {
        this.hiringError.set(err?.error?.detail ?? err?.error?.message ?? 'Erreur de chargement.');
        this.hiringLoading.set(false);
      },
    });
  }

  navigateToNew(): void {
    this.router.navigate(['..'], { relativeTo: this.route });
  }

  openApprove(cost: CostLineDto): void { this.openDecisionModal(cost, 'approve'); }
  openReject(cost: CostLineDto):  void { this.openDecisionModal(cost, 'reject'); }

  openDecisionModal(cost: CostLineDto, decision: 'approve' | 'reject'): void {
    this.selectedCost.set(cost);
    this.modalDecision.set(decision);
    this.approvalCommentSig.set('');
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

    const comment = this.approvalCommentSig().trim();
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

  urgencyClass(level: string | null): string {
    if (!level || level === 'L1') return 'low';
    if (level === 'L2') return 'normal';
    return 'urgent';
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

  getInputValue(e: Event): string {
    return (e.target as HTMLInputElement).value;
  }

  // ── Hiring tab helpers ────────────────────────────────────────────────────────

  openHiringApprove(item: HiringCostApprovalDto): void { this.openHiringDecisionModal(item, 'approve'); }
  openHiringReject(item: HiringCostApprovalDto):  void { this.openHiringDecisionModal(item, 'reject'); }

  openHiringDecisionModal(item: HiringCostApprovalDto, decision: 'approve' | 'reject'): void {
    this.selectedHiring.set(item);
    this.hiringDecision.set(decision);
    this.hiringCommentSig.set('');
    this.hiringContrePropSig.set(null);
    this.hiringModalError.set(null);
    this.hiringApprovalRef = this.modal.open({
      title:           'Décision — coût salarial',
      body:            this.hiringApprovalTpl,
      size:            'md',
      closeOnBackdrop: false,
      buttons: [
        { label: 'Annuler',   variant: 'secondary', action: r => r.close() },
        { label: 'Confirmer', variant: 'primary',   action: _r => this.submitHiringApproval() },
      ],
    });
  }

  submitHiringApproval(): void {
    const item     = this.selectedHiring();
    const decision = this.hiringDecision();
    if (!item) return;

    const comment = this.hiringCommentSig().trim();
    if (decision === 'reject' && !comment) {
      this.hiringModalError.set('Un commentaire est obligatoire en cas de refus.');
      return;
    }

    this.isHiringSubmitting.set(true);
    this.hiringModalError.set(null);

    const contreProp = this.hiringContrePropSig();
    const call$ = decision === 'approve'
      ? this.hiringSvc.approve(item.id, comment || undefined)
      : this.hiringSvc.reject(item.id, comment, contreProp ?? undefined);

    call$.subscribe({
      next: () => {
        this.isHiringSubmitting.set(false);
        this.hiringApprovalRef?.close();
        this.hiringPending.update(list => list.filter(i => i.id !== item.id));
      },
      error: err => {
        this.isHiringSubmitting.set(false);
        this.hiringModalError.set(err?.error?.detail ?? err?.error?.message ?? 'Une erreur est survenue.');
      },
    });
  }

  hiringInitials(item: HiringCostApprovalDto): string {
    return ((item.candidateFirstName?.[0] ?? '') + (item.candidateLastName?.[0] ?? '')).toUpperCase() || '?';
  }

  hiringSnap(item: HiringCostApprovalDto) {
    return this.hiringSvc.parseSnapshot(item.simulationSnapshot);
  }

  hiringAnnualCost(item: HiringCostApprovalDto): number | undefined {
    const c = this.hiringSvc.parseSnapshot(item.simulationSnapshot).loadedCost;
    return c != null ? c * 12 : undefined;
  }

  urgencyBadgeOptions(level: string | null): BadgeOptions {
    if (!level || level === 'L1') return { variant: 'neutral', pill: true, size: 'sm' };
    if (level === 'L2') return { variant: 'warning', pill: true, size: 'sm' };
    return { variant: 'danger', pill: true, size: 'sm' };
  }
}
