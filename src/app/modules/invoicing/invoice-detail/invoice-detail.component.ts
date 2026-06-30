import { Component, OnInit, inject, input, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from '../invoice.service';
import {
  InvoiceDetail, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS, InvoiceStatut,
} from '../invoice.model';
import { StatusBadgeComponent } from '../../../shared/status-badge.component';
import { PageHeaderComponent } from '../../../shared/page-header.component';
import { PaymentModalComponent } from '../payment-modal.component';
import { CreditNoteModalComponent } from './credit-note-modal.component';
import { RemindersPanelComponent } from './reminders-panel.component';
import { PermissionDirective } from '../../../shared/permission.directive';
import {
  CardComponent, ButtonComponent,
  StepperComponent, StepperStep, StepperConfig,
} from '@khalilrebhiitec/daf360';

@Component({
  selector: 'app-invoice-detail',
  imports: [
    RouterLink, FormsModule,
    StatusBadgeComponent,
    PageHeaderComponent,
    PaymentModalComponent,
    CreditNoteModalComponent,
    RemindersPanelComponent,
    PermissionDirective,
    CardComponent, ButtonComponent, StepperComponent,
  ],
  templateUrl: './invoice-detail.component.html',
  styleUrl:    './invoice-detail.component.scss',
})
export class InvoiceDetailComponent implements OnInit {
  private readonly svc = inject(InvoiceService);

  id = input<string>();

  invoice       = signal<InvoiceDetail | null>(null);
  loading       = signal(false);
  error         = signal<string | null>(null);
  actionError   = signal<string | null>(null);
  saving        = signal(false);

  showPaymentModal   = signal(false);
  showCreditNote     = signal(false);
  showDisputeForm    = signal(false);
  disputeReason      = '';
  showResolveForm    = signal(false);
  resolveNotes       = '';
  approvalDecision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE';
  approvalComment    = '';

  // ── Status computeds ──────────────────────────────────────────────────────

  readonly statut = computed(() => this.invoice()?.statut ?? '');

  readonly statutConfig = computed(() =>
    INVOICE_STATUT_CONFIG[this.statut()] ?? { label: this.statut(), bg: '#f1f5f9', color: '#64748b', border: '#e2e8f0' }
  );

  readonly isOverdue = computed(() => {
    const inv = this.invoice();
    if (!inv || !OVERDUE_STATUTS.has(inv.statut)) return false;
    if (!inv.dateEcheance) return false;
    return new Date(inv.dateEcheance) < new Date();
  });

  readonly billingProgress = computed(() => {
    const map: Record<string, number> = {
      DRAFT: 5, SUBMITTED: 15, RETURNED: 10, APPROVED: 30,
      EMITTED: 50, SENT: 65, PARTIALLY_PAID: 75, PAID: 100,
      DISPUTED: 40, CANCELLED: 0, CREDIT_NOTED: 80,
    };
    return map[this.statut()] ?? 0;
  });

  readonly montantRestant = computed(() => {
    const inv = this.invoice();
    if (!inv) return 0;
    if (inv.statut === 'PAID') return 0;
    if (inv.statut === 'PARTIALLY_PAID') return inv.montantTtc / 2;
    return inv.montantTtc;
  });

  // ── Lifecycle stepper ─────────────────────────────────────────────────────

  readonly lifecycleSteps: StepperStep[] = [
    { title: 'Brouillon'   },
    { title: 'En revue'    },
    { title: 'Validée'     },
    { title: 'Émise'       },
    { title: 'Envoyée'     },
    { title: 'Part. payée' },
    { title: 'Terminée'    },
  ];

  readonly detailStep = computed(() => {
    const map: Record<string, number> = {
      DRAFT: 1, RETURNED: 1,
      SUBMITTED: 2,
      APPROVED: 3,
      EMITTED: 4,
      SENT: 5, DISPUTED: 5,
      PARTIALLY_PAID: 6,
      PAID: 7, CREDIT_NOTED: 7, CANCELLED: 7,
    };
    return map[this.statut()] ?? 1;
  });

  readonly lifecycleConfig = computed((): StepperConfig => {
    const s = this.statut();
    const cfgMap: Partial<Record<string, StepperConfig>> = {
      DRAFT:          { nextLabel: 'Soumettre pour validation', showCancel: false },
      RETURNED:       { nextLabel: 'Soumettre à nouveau',       showCancel: false },
      SUBMITTED:      { nextLabel: 'Confirmer la décision',     prevLabel: 'Annuler', showCancel: false },
      APPROVED:       { nextLabel: 'Émettre la facture',        showCancel: false },
      EMITTED:        { nextLabel: 'Marquer comme envoyée',     showCancel: false },
      SENT:           { nextLabel: 'Enregistrer un paiement',   showCancel: false },
      PARTIALLY_PAID: { nextLabel: 'Enregistrer un paiement',   showCancel: false },
      PAID:           { finishLabel: 'Émettre un avoir',        showCancel: false },
      CREDIT_NOTED:   { finishLabel: 'Avoir émis ✓',            showCancel: false },
      DISPUTED:       { nextLabel: 'Résoudre le litige',        showCancel: false },
      CANCELLED:      { finishLabel: 'Annulée',                 showCancel: false },
    };
    return cfgMap[s] ?? { showCancel: false };
  });

  readonly lifecycleStepValid = computed(() => !this.saving());

  onStepperNext(): void {
    switch (this.statut()) {
      case 'DRAFT':
      case 'RETURNED':       this.submitForReview(); break;
      case 'SUBMITTED':      this.approve();         break;
      case 'APPROVED':       this.emit();            break;
      case 'EMITTED':        this.markSent();        break;
      case 'SENT':
      case 'PARTIALLY_PAID': this.showPaymentModal.set(true); break;
      case 'DISPUTED':       this.showResolveForm.set(true);  break;
    }
  }

  onStepperPrev(): void {
    if (this.statut() === 'SUBMITTED') {
      this.approvalDecision = 'RETURN';
      this.approvalComment  = '';
    }
  }

  onStepperFinish(): void {
    if (this.statut() === 'PAID') this.showCreditNote.set(true);
  }

  // ── CRUD actions ──────────────────────────────────────────────────────────

  ngOnInit(): void {
    const numId = Number(this.id());
    if (!numId) return;
    this.load(numId);
  }

  load(id: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.svc.getInvoice(id).subscribe({
      next:  inv => { this.invoice.set(inv); this.loading.set(false); },
      error: () => { this.error.set('Impossible de charger la facture.'); this.loading.set(false); },
    });
  }

  refresh(): void {
    const numId = Number(this.id());
    if (numId) this.load(numId);
  }

  submitForReview(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.submit(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  approve(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.approve(inv.id, { decision: this.approvalDecision, comment: this.approvalComment.trim() || null }).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  emit(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.emit(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  markSent(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.markSent(inv.id).subscribe({
      next:  () => { this.saving.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  submitDispute(): void {
    const inv = this.invoice(); if (!inv || !this.disputeReason.trim()) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.openDispute(inv.id, { reason: this.disputeReason.trim() }).subscribe({
      next:  () => { this.saving.set(false); this.showDisputeForm.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  submitResolve(): void {
    const inv = this.invoice(); if (!inv) return;
    this.saving.set(true); this.actionError.set(null);
    this.svc.resolveDispute(inv.id, this.resolveNotes.trim() || null).subscribe({
      next:  () => { this.saving.set(false); this.showResolveForm.set(false); this.refresh(); },
      error: err => { this.saving.set(false); this.actionError.set(err?.error?.message ?? 'Erreur.'); },
    });
  }

  onPaymentClosed(saved: boolean): void   { this.showPaymentModal.set(false); if (saved) this.refresh(); }
  onCreditNoteClosed(saved: boolean): void { this.showCreditNote.set(false);  if (saved) this.refresh(); }

  // ── Helpers ───────────────────────────────────────────────────────────────

  lineTtc(l: { quantity: number; unitRate: number; vatRatePct: number }): number {
    return l.quantity * l.unitRate * (1 + l.vatRatePct / 100);
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
