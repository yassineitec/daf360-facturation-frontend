import { Component, OnInit, inject, input, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { InvoiceService } from './invoice.service';
import {
  InvoiceDetail, INVOICE_STATUT_CONFIG, OVERDUE_STATUTS, InvoiceStatut,
} from './invoice.model';
import { InvoiceStatusTimelineComponent } from '../../shared/invoice-status-timeline.component';
import { PaymentModalComponent } from './payment-modal.component';
import { CreditNoteModalComponent } from './credit-note-modal.component';
import { RemindersPanelComponent } from './reminders-panel.component';
import { PermissionDirective } from '../../shared/permission.directive';

@Component({
  selector: 'app-invoice-detail',
  imports: [
    RouterLink, FormsModule,
    InvoiceStatusTimelineComponent,
    PaymentModalComponent,
    CreditNoteModalComponent,
    RemindersPanelComponent,
    PermissionDirective,
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
  showApprovalForm   = signal(false);
  approvalDecision: 'APPROVE' | 'RETURN' | 'REJECT' = 'APPROVE';
  approvalComment    = '';

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

  // ── Lifecycle actions ──────────────────────────────────────────────────────

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
      next:  () => { this.saving.set(false); this.showApprovalForm.set(false); this.refresh(); },
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

  onPaymentClosed(saved: boolean): void { this.showPaymentModal.set(false); if (saved) this.refresh(); }
  onCreditNoteClosed(saved: boolean): void { this.showCreditNote.set(false); if (saved) this.refresh(); }

  // ── Helpers ────────────────────────────────────────────────────────────────

  lineTtc(l: { quantity: number; unitRate: number; vatRatePct: number }): number {
    const ht = l.quantity * l.unitRate;
    return ht * (1 + l.vatRatePct / 100);
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: devise, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(v);
  }

  formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  }
}
