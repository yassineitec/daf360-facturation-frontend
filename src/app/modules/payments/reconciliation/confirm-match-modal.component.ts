import { Component, inject, input, output, signal } from '@angular/core';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction } from '../payment.model';

@Component({
  selector: 'app-confirm-match-modal',
  imports: [],
  template: `
<div class="modal-backdrop" (click)="dismissed.emit()">
  <div class="modal-box" (click)="$event.stopPropagation()">
    <h3 class="modal-title">Confirmer le rapprochement</h3>

    <p class="confirm-text">
      Vous allez rapprocher ce virement de
      <strong>{{ formatAmount(tx().montant, tx().devise) }}</strong>
      ({{ formatDate(tx().transactionDate) }})
      avec la facture
      <strong>{{ tx().proposedInvoiceNumber ?? 'N°??' }}</strong>
      de <strong>{{ tx().proposedClientNom ?? 'Client inconnu' }}</strong>.
      Confirmer&nbsp;?
    </p>

    @if (tx().confidence !== null) {
      <div class="confidence-row">
        <span class="conf-label">Confiance</span>
        <span class="conf-val" [class.conf-high]="(tx().confidence ?? 0) >= 90"
          [class.conf-med]="(tx().confidence ?? 0) >= 70 && (tx().confidence ?? 0) < 90"
          [class.conf-low]="(tx().confidence ?? 0) < 70">
          {{ tx().confidence }}%
        </span>
      </div>
    }

    @if (serverError()) {
      <div class="modal-error">{{ serverError() }}</div>
    }

    <div class="modal-actions">
      <button class="btn-cancel" [disabled]="saving()" (click)="dismissed.emit()">Annuler</button>
      <button class="btn-confirm" [disabled]="saving()" (click)="confirm()">
        {{ saving() ? 'Enregistrement…' : 'Confirmer' }}
      </button>
    </div>
  </div>
</div>
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,0.45);
      display: flex; align-items: center; justify-content: center; z-index: 1000;
    }
    .modal-box {
      background: #fff; border-radius: 12px; padding: 2rem; width: 480px; max-width: 95vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18);
    }
    .modal-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; margin: 0 0 1rem; }
    .confirm-text { font-size: 0.9375rem; color: #334155; line-height: 1.6; margin: 0 0 1rem; }
    .confidence-row {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem 0.75rem; background: #f8fafc; border-radius: 6px; margin-bottom: 1rem;
    }
    .conf-label { font-size: 0.8rem; color: #64748b; font-weight: 500; }
    .conf-val { font-weight: 700; font-size: 0.875rem; }
    .conf-high  { color: #065f46; }
    .conf-med   { color: #92400e; }
    .conf-low   { color: #991b1b; }
    .modal-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.625rem 0.875rem; font-size: 0.875rem; margin-bottom: 1rem;
    }
    .modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; }
    .btn-cancel {
      padding: 0.5rem 1.25rem; border: 1px solid #cbd5e1; border-radius: 6px;
      background: #fff; color: #374151; font-size: 0.875rem; cursor: pointer;
      &:hover:not(:disabled) { background: #f1f5f9; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
    .btn-confirm {
      padding: 0.5rem 1.25rem; border: none; border-radius: 6px;
      background: #16a34a; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: #15803d; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class ConfirmMatchModalComponent {
  private readonly svc = inject(ReconciliationService);

  tx        = input.required<BankTransaction>();
  dismissed = output<void>();
  confirmed = output<void>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  confirm(): void {
    const invoiceId = this.tx().proposedInvoiceId;
    if (!invoiceId) return;
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.confirmMatch(this.tx().id, invoiceId).subscribe({
      next:  () => { this.saving.set(false); this.confirmed.emit(); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Erreur lors de la confirmation.');
      },
    });
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
