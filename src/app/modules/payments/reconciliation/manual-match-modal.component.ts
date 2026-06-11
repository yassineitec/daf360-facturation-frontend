import { Component, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction } from '../payment.model';
import { InvoiceListItem } from '../../invoicing/invoice.model';

@Component({
  selector: 'app-manual-match-modal',
  imports: [FormsModule],
  template: `
<div class="modal-backdrop" (click)="dismissed.emit()">
  <div class="modal-box" (click)="$event.stopPropagation()">
    <h3 class="modal-title">Rapprochement manuel</h3>

    <div class="tx-summary">
      <span class="tx-label">Virement</span>
      <span class="tx-detail">
        {{ formatAmount(tx().montant, tx().devise) }} — {{ tx().reference ?? tx().description ?? '—' }}
        ({{ formatDate(tx().transactionDate) }})
      </span>
    </div>

    <div class="search-section">
      <label class="search-label">Rechercher une facture</label>
      <input type="search" class="search-input" placeholder="Numéro facture, client, affaire…"
        [value]="searchQuery()" (input)="onSearchInput($event)"
        maxlength="100" autocomplete="off" />
    </div>

    @if (searching()) {
      <div class="search-hint">Recherche…</div>
    }

    @if (results().length > 0) {
      <div class="results-list">
        @for (inv of results(); track inv.id) {
          <div class="result-row" [class.selected]="selectedInvoice()?.id === inv.id"
            (click)="selectInvoice(inv)">
            <div class="result-main">
              <span class="result-num">{{ inv.invoiceNumber ?? 'Brouillon' }}</span>
              <span class="result-client">{{ inv.clientNom }}</span>
            </div>
            <div class="result-meta">
              <span class="result-amount">{{ formatAmount(inv.montantTtc, inv.devise) }}</span>
              @if (inv.dateEcheance) {
                <span class="result-due">Éch. {{ formatDate(inv.dateEcheance) }}</span>
              }
            </div>
          </div>
        }
      </div>
    }

    @if (selectedInvoice()) {
      <div class="selected-confirm">
        Rapprocher avec <strong>{{ selectedInvoice()!.invoiceNumber ?? 'Brouillon' }}</strong>
        — {{ selectedInvoice()!.clientNom }}
        ({{ formatAmount(selectedInvoice()!.montantTtc, selectedInvoice()!.devise) }})
      </div>
    }

    @if (serverError()) {
      <div class="modal-error">{{ serverError() }}</div>
    }

    <div class="modal-actions">
      <button class="btn-cancel" [disabled]="saving()" (click)="dismissed.emit()">Annuler</button>
      <button class="btn-confirm" [disabled]="saving() || !selectedInvoice()" (click)="confirm()">
        {{ saving() ? 'Enregistrement…' : 'Confirmer le rapprochement' }}
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
      background: #fff; border-radius: 12px; padding: 2rem; width: 540px; max-width: 95vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 1rem;
    }
    .modal-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; margin: 0; }
    .tx-summary {
      display: flex; flex-direction: column; gap: 0.25rem;
      padding: 0.75rem; background: #f8fafc; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .tx-label { font-size: 0.7rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .tx-detail { font-size: 0.9rem; color: #0f172a; font-weight: 500; }
    .search-section { display: flex; flex-direction: column; gap: 0.375rem; }
    .search-label { font-size: 0.8rem; font-weight: 500; color: #374151; }
    .search-input {
      height: 36px; padding: 0 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    .search-hint { font-size: 0.8rem; color: #94a3b8; }
    .results-list {
      border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden;
      max-height: 240px; overflow-y: auto;
    }
    .result-row {
      display: flex; justify-content: space-between; align-items: center;
      padding: 0.625rem 0.875rem; cursor: pointer; border-bottom: 1px solid #f1f5f9;
      &:last-child { border-bottom: none; }
      &:hover { background: #f8fafc; }
      &.selected { background: #dbeafe; }
    }
    .result-main { display: flex; flex-direction: column; gap: 0.125rem; }
    .result-num { font-weight: 600; font-size: 0.875rem; color: #0f172a; }
    .result-client { font-size: 0.8rem; color: #64748b; }
    .result-meta { display: flex; flex-direction: column; align-items: flex-end; gap: 0.125rem; }
    .result-amount { font-weight: 600; font-size: 0.875rem; color: #0f172a; }
    .result-due { font-size: 0.75rem; color: #64748b; }
    .selected-confirm {
      padding: 0.625rem 0.875rem; background: #dbeafe; border-radius: 6px;
      font-size: 0.875rem; color: #1e40af;
    }
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
      background: #16a34a; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: #15803d; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class ManualMatchModalComponent {
  private readonly svc = inject(ReconciliationService);
  private readonly search$ = new Subject<string>();

  tx        = input.required<BankTransaction>();
  dismissed = output<void>();
  confirmed = output<void>();

  searchQuery     = signal('');
  searching       = signal(false);
  results         = signal<InvoiceListItem[]>([]);
  selectedInvoice = signal<InvoiceListItem | null>(null);
  saving          = signal(false);
  serverError     = signal<string | null>(null);

  constructor() {
    this.search$.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(q => { this.searching.set(true); return this.svc.searchInvoicesForMatch(q); }),
    ).subscribe({
      next:  res => { this.results.set(res.content); this.searching.set(false); },
      error: ()  => this.searching.set(false),
    });
  }

  onSearchInput(e: Event): void {
    const q = (e.target as HTMLInputElement).value;
    this.searchQuery.set(q);
    this.selectedInvoice.set(null);
    if (q.trim().length >= 2) this.search$.next(q.trim());
    else this.results.set([]);
  }

  selectInvoice(inv: InvoiceListItem): void {
    this.selectedInvoice.set(inv);
  }

  confirm(): void {
    const inv = this.selectedInvoice();
    if (!inv) return;
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.confirmMatch(this.tx().id, inv.id).subscribe({
      next:  () => { this.saving.set(false); this.confirmed.emit(); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? 'Erreur lors du rapprochement.');
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
