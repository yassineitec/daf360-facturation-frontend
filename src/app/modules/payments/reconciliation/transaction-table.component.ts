import { Component, inject, input, output, signal } from '@angular/core';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction, MATCH_STATUT_CONFIG } from '../payment.model';
import { ConfirmMatchModalComponent } from './confirm-match-modal.component';
import { ManualMatchModalComponent } from './manual-match-modal.component';
import { PartialMatchModalComponent } from './partial-match-modal.component';
import { AcompteModalComponent } from './acompte-modal.component';

@Component({
  selector: 'app-transaction-table',
  imports: [ConfirmMatchModalComponent, ManualMatchModalComponent, PartialMatchModalComponent, AcompteModalComponent],
  template: `
<div class="tx-table-wrap">
  <table class="tx-table">
    <thead>
      <tr>
        <th>Date</th>
        <th>Référence</th>
        <th>Description</th>
        <th class="num-col">Montant</th>
        <th>Statut</th>
        <th>Facture proposée</th>
        <th class="action-col">Actions</th>
      </tr>
    </thead>
    <tbody>
      @if (transactions().length === 0) {
        <tr>
          <td colspan="7" class="empty-cell">
            Aucune transaction. Importez un relevé bancaire pour commencer.
          </td>
        </tr>
      }
      @for (tx of transactions(); track tx.id) {
        <tr class="tx-row" [class.tx-confirmed]="tx.statut === 'CONFIRMED'"
          [class.tx-rejected]="tx.statut === 'REJECTED'"
          [class.tx-partial]="tx.statut === 'PARTIALLY_MATCHED'"
          [class.tx-acompte]="tx.statut === 'ACOMPTE'">
          <td class="date-cell">{{ formatDate(tx.transactionDate) }}</td>
          <td class="ref-cell">{{ tx.reference ?? '—' }}</td>
          <td class="desc-cell">{{ tx.description ?? '—' }}</td>
          <td class="num-col amount-cell">{{ formatAmount(tx.montant, tx.devise) }}</td>
          <td class="statut-cell">
            <span class="statut-badge"
              [style.background]="statutConfig(tx.statut).bg"
              [style.color]="statutConfig(tx.statut).color"
              [style.border-color]="statutConfig(tx.statut).border">
              {{ statutConfig(tx.statut).label }}
            </span>
            @if (tx.statut === 'PROPOSED' && tx.confidence !== null) {
              <span class="confidence">{{ tx.confidence }}%</span>
            }
          </td>
          <td class="invoice-cell">
            @if (tx.proposedInvoiceNumber) {
              <span class="prop-num">{{ tx.proposedInvoiceNumber }}</span>
              @if (tx.proposedClientNom) {
                <span class="prop-client">{{ tx.proposedClientNom }}</span>
              }
            } @else {
              <span class="no-proposal">—</span>
            }
          </td>
          <td class="action-col" (click)="$event.stopPropagation()">
            @switch (tx.statut) {
              @case ('PROPOSED') {
                <div class="action-btns">
                  <button class="btn-accept"  (click)="openConfirm(tx)">Confirmer</button>
                  <button class="btn-partial" (click)="openPartial(tx)">Partiel</button>
                  <button class="btn-reject"  (click)="rejectTx(tx)">Rejeter</button>
                </div>
              }
              @case ('UNMATCHED') {
                <div class="action-btns">
                  <button class="btn-manual"  (click)="openManual(tx)">Rapprocher</button>
                  <button class="btn-partial" (click)="openPartial(tx)">Partiel</button>
                  <button class="btn-acompte" (click)="openAcompte(tx)">Acompte</button>
                </div>
              }
              @default {}
            }
          </td>
        </tr>
      }
    </tbody>
  </table>
</div>

@if (actionError()) {
  <div class="action-error">{{ actionError() }}</div>
}

@if (confirmTarget()) {
  <app-confirm-match-modal
    [tx]="confirmTarget()!"
    (dismissed)="confirmTarget.set(null)"
    (confirmed)="onConfirmed()" />
}

@if (manualTarget()) {
  <app-manual-match-modal
    [tx]="manualTarget()!"
    (dismissed)="manualTarget.set(null)"
    (confirmed)="onConfirmed()" />
}

@if (partialTarget()) {
  <app-partial-match-modal
    [tx]="partialTarget()!"
    (dismissed)="partialTarget.set(null)"
    (confirmed)="onPartialConfirmed()" />
}

@if (acompteTarget()) {
  <app-acompte-modal
    [tx]="acompteTarget()!"
    (dismissed)="acompteTarget.set(null)"
    (confirmed)="onAcompteConfirmed()" />
}
  `,
  styles: [`
    .tx-table-wrap {
      background: #fff; border: 1px solid #e2e8f0; border-radius: 8px;
      overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
    }
    .tx-table {
      width: 100%; border-collapse: collapse; font-size: 0.875rem;

      thead tr { background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
      th {
        padding: 0.75rem 1rem; text-align: left; font-size: 0.75rem;
        font-weight: 600; color: #64748b; text-transform: uppercase;
        letter-spacing: 0.04em; white-space: nowrap;
      }
      tbody tr.tx-row {
        border-bottom: 1px solid #f1f5f9;
        &:last-child { border-bottom: none; }
        &.tx-confirmed { background: #f0fdf4; }
        &.tx-rejected  { background: #fafafa; opacity: 0.75; }
        &.tx-partial   { background: #f0f9ff; }
        &.tx-acompte   { background: #faf5ff; }
      }
      td { padding: 0.75rem 1rem; color: #374151; vertical-align: middle; }
    }
    .num-col  { text-align: right; }
    .action-col { text-align: center; width: 210px; }
    .amount-cell { font-weight: 600; }
    .date-cell   { white-space: nowrap; }
    .ref-cell    { font-family: monospace; font-size: 0.8rem; color: #475569; }
    .desc-cell   { max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .statut-cell { white-space: nowrap; }
    .statut-badge {
      display: inline-block; padding: 0.15rem 0.625rem; border-radius: 12px;
      font-size: 0.75rem; font-weight: 600; border: 1px solid;
    }
    .confidence {
      font-size: 0.75rem; color: #92400e; font-weight: 600; margin-left: 0.375rem;
    }
    .invoice-cell { display: flex; flex-direction: column; gap: 0.125rem; }
    .prop-num    { font-weight: 600; color: #0f172a; }
    .prop-client { font-size: 0.75rem; color: #64748b; }
    .no-proposal { color: #94a3b8; }
    .action-btns { display: flex; gap: 0.375rem; justify-content: center; }
    .btn-accept, .btn-reject, .btn-manual, .btn-partial, .btn-acompte {
      padding: 0.25rem 0.5rem; border-radius: 4px; font-size: 0.775rem;
      font-weight: 500; cursor: pointer; border: 1px solid transparent; white-space: nowrap;
    }
    .btn-accept {
      background: #d1fae5; color: #065f46; border-color: #6ee7b7;
      &:hover { background: #a7f3d0; }
    }
    .btn-reject {
      background: #fee2e2; color: #991b1b; border-color: #fca5a5;
      &:hover { background: #fecaca; }
    }
    .btn-manual {
      background: #eff6ff; color: #1e40af; border-color: #93c5fd;
      &:hover { background: #dbeafe; }
    }
    .btn-partial {
      background: #e0f2fe; color: #0369a1; border-color: #7dd3fc;
      &:hover { background: #bae6fd; }
    }
    .btn-acompte {
      background: #faf5ff; color: #7c3aed; border-color: #c4b5fd;
      &:hover { background: #ede9fe; }
    }
    .empty-cell {
      text-align: center; color: #94a3b8; padding: 3rem 1rem; font-style: italic;
    }
    .action-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.625rem 0.875rem; font-size: 0.875rem; margin-top: 0.5rem;
    }
  `],
})
export class TransactionTableComponent {
  private readonly svc = inject(ReconciliationService);

  transactions = input.required<BankTransaction[]>();
  refreshNeeded = output<void>();

  confirmTarget  = signal<BankTransaction | null>(null);
  manualTarget   = signal<BankTransaction | null>(null);
  partialTarget  = signal<BankTransaction | null>(null);
  acompteTarget  = signal<BankTransaction | null>(null);
  actionError    = signal<string | null>(null);

  openConfirm(tx: BankTransaction): void {
    this.actionError.set(null);
    this.confirmTarget.set(tx);
  }

  openManual(tx: BankTransaction): void {
    this.actionError.set(null);
    this.manualTarget.set(tx);
  }

  openPartial(tx: BankTransaction): void {
    this.actionError.set(null);
    this.partialTarget.set(tx);
  }

  openAcompte(tx: BankTransaction): void {
    this.actionError.set(null);
    this.acompteTarget.set(tx);
  }

  rejectTx(tx: BankTransaction): void {
    this.actionError.set(null);
    this.svc.rejectMatch(tx.id).subscribe({
      next:  () => this.refreshNeeded.emit(),
      error: err => this.actionError.set(err?.error?.message ?? 'Erreur lors du rejet.'),
    });
  }

  onConfirmed(): void {
    this.confirmTarget.set(null);
    this.manualTarget.set(null);
    this.refreshNeeded.emit();
  }

  onPartialConfirmed(): void {
    this.partialTarget.set(null);
    this.refreshNeeded.emit();
  }

  onAcompteConfirmed(): void {
    this.acompteTarget.set(null);
    this.refreshNeeded.emit();
  }

  statutConfig(statut: string) {
    return MATCH_STATUT_CONFIG[statut] ?? MATCH_STATUT_CONFIG['UNMATCHED'];
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
