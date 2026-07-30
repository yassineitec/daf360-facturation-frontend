import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction } from '../payment.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

interface ClientOption { id: number; nom: string; }

@Component({
  selector: 'app-acompte-modal',
  imports: [FormsModule, DisplayCurrencyPipe],
  template: `
<div class="modal-backdrop" (click)="dismissed.emit()">
  <div class="modal-box" (click)="$event.stopPropagation()">
    <h3 class="modal-title">Enregistrer comme acompte</h3>

    <div class="tx-summary">
      <span class="tx-label">Transaction</span>
      <span class="tx-detail">
        {{ tx().montant | displayCurrency : tx().devise }} — {{ tx().reference ?? tx().description ?? '—' }}
        ({{ formatDate(tx().transactionDate) }})
      </span>
    </div>

    <div class="info-banner">
      Ce virement sera enregistré comme acompte client. Aucune facture ne sera liée — le montant
      sera affecté au solde du client sélectionné.
    </div>

    <div class="field-section">
      <label class="field-label">Client <span class="required">*</span></label>
      @if (loadingClients()) {
        <div class="search-hint">Chargement des clients…</div>
      } @else {
        <select class="field-select" [(ngModel)]="selectedClientId">
          <option [ngValue]="0" disabled>Sélectionner un client…</option>
          @for (c of clients(); track c.id) {
            <option [ngValue]="c.id">{{ c.nom }}</option>
          }
        </select>
      }
    </div>

    <div class="field-section">
      <label class="field-label">Commentaire <span class="optional">(facultatif)</span></label>
      <textarea class="field-textarea" rows="2" maxlength="500"
        placeholder="Ex : acompte sur contrat XYZ…"
        [(ngModel)]="commentaire"></textarea>
    </div>

    @if (serverError()) {
      <div class="modal-error">{{ serverError() }}</div>
    }

    <div class="modal-actions">
      <button class="btn-cancel" [disabled]="saving()" (click)="dismissed.emit()">Annuler</button>
      <button class="btn-confirm" [disabled]="saving() || !selectedClientId" (click)="confirm()">
        {{ saving() ? 'Enregistrement…' : 'Enregistrer l\'acompte' }}
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
      background: #fff; border-radius: 12px; padding: 2rem; width: 500px; max-width: 95vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 1rem;
    }
    .modal-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; margin: 0; }
    .tx-summary {
      display: flex; flex-direction: column; gap: 0.25rem;
      padding: 0.75rem; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .tx-label { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .tx-detail { font-size: 0.9rem; color: #0f172a; font-weight: 500; }
    .info-banner {
      background: #faf5ff; border: 1px solid #e9d5ff; border-radius: 6px;
      padding: 0.75rem; font-size: 0.8rem; color: #6b21a8; line-height: 1.5;
    }
    .field-section { display: flex; flex-direction: column; gap: 0.375rem; }
    .field-label { font-size: 0.8rem; font-weight: 500; color: #374151; }
    .required { color: #dc2626; }
    .optional { font-weight: 400; color: #94a3b8; }
    .field-select {
      height: 36px; padding: 0 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a; background: #fff; cursor: pointer;
      &:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.15); }
    }
    .field-textarea {
      padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a; resize: vertical; font-family: inherit;
      &:focus { outline: none; border-color: #7c3aed; box-shadow: 0 0 0 2px rgba(124,58,237,0.15); }
    }
    .search-hint { font-size: 0.8rem; color: #94a3b8; }
    .modal-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.625rem 0.875rem; font-size: 0.875rem;
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
      background: #7c3aed; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: #6d28d9; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class AcompteModalComponent {
  private readonly svc  = inject(ReconciliationService);
  private readonly http = inject(HttpClient);

  tx        = input.required<BankTransaction>();
  dismissed = output<void>();
  confirmed = output<void>();

  clients       = signal<ClientOption[]>([]);
  loadingClients = signal(true);
  saving        = signal(false);
  serverError   = signal<string | null>(null);

  selectedClientId = 0;
  commentaire      = '';

  constructor() {
    this.http.get<ClientOption[]>(`${environment.factApiUrl}/api/fact/clients/dropdown`).subscribe({
      next:  list => { this.clients.set(list); this.loadingClients.set(false); },
      error: ()   => this.loadingClients.set(false),
    });
  }

  confirm(): void {
    if (!this.selectedClientId) return;
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.recordAcompte(
      this.tx().id,
      this.selectedClientId,
      this.commentaire.trim() || undefined,
    ).subscribe({
      next:  () => { this.saving.set(false); this.confirmed.emit(); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Erreur lors de l\'enregistrement de l\'acompte.');
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
