import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { InvoiceService } from './invoice.service';
import { InvoiceListItem, InvoiceDetail, PAYMENT_MODES } from './invoice.model';

@Component({
  selector: 'app-payment-modal',
  imports: [ReactiveFormsModule],
  template: `
<div class="overlay" (click)="onOverlay($event)">
  <div class="modal">
    <div class="modal-header">
      <h2>Enregistrer un paiement</h2>
      <button class="close-btn" type="button" (click)="cancel()">&times;</button>
    </div>

    <div class="invoice-summary">
      <span class="inv-num">{{ invoice().invoiceNumber ?? 'Brouillon' }}</span>
      <span class="inv-client">{{ invoice().clientNom }}</span>
      <span class="inv-amount">{{ formatAmount(invoice().montantTtc, invoice().devise) }}</span>
    </div>

    <form [formGroup]="form" (ngSubmit)="submit()" class="modal-body">
      <div class="field">
        <label for="pm-date">Date de règlement *</label>
        <input id="pm-date" type="date" formControlName="dateReglement" class="form-input"
          [class.invalid]="f['dateReglement'].invalid && f['dateReglement'].touched" />
        @if (f['dateReglement'].invalid && f['dateReglement'].touched) {
          <span class="error-msg">Date requise.</span>
        }
      </div>

      <div class="field">
        <label for="pm-amount">Montant payé ({{ invoice().devise }}) *</label>
        <input id="pm-amount" type="number" formControlName="montant" class="form-input"
          step="0.01" min="0.01"
          [class.invalid]="f['montant'].invalid && f['montant'].touched"
          placeholder="0.00" />
        @if (f['montant'].invalid && f['montant'].touched) {
          <span class="error-msg">Montant requis (> 0).</span>
        }
      </div>

      <div class="field">
        <label for="pm-mode">Mode de paiement *</label>
        <select id="pm-mode" formControlName="modePaiement" class="form-input"
          [class.invalid]="f['modePaiement'].invalid && f['modePaiement'].touched">
          <option value="">Sélectionner…</option>
          @for (opt of paymentModeOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
        @if (f['modePaiement'].invalid && f['modePaiement'].touched) {
          <span class="error-msg">Mode de paiement requis.</span>
        }
      </div>

      <div class="field">
        <label for="pm-ref">Référence bancaire</label>
        <input id="pm-ref" type="text" formControlName="referenceBancaire" class="form-input"
          maxlength="100" placeholder="Optionnel" />
      </div>

      @if (serverError()) {
        <div class="server-error">{{ serverError() }}</div>
      }

      <div class="modal-actions">
        <button type="button" class="btn-cancel" (click)="cancel()">Annuler</button>
        <button type="submit" class="btn-save" [disabled]="saving()">
          {{ saving() ? 'Enregistrement…' : 'Enregistrer' }}
        </button>
      </div>
    </form>
  </div>
</div>
  `,
  styleUrl: './payment-modal.component.scss',
})
export class PaymentModalComponent {
  private readonly fb  = inject(FormBuilder);
  private readonly svc = inject(InvoiceService);

  invoice = input.required<InvoiceListItem | InvoiceDetail>();
  closed  = output<boolean>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  readonly paymentModeOptions = Object.entries(PAYMENT_MODES)
    .map(([value, label]) => ({ value, label }));

  form = this.fb.group({
    dateReglement:    ['', Validators.required],
    montant:          [null as number | null, [Validators.required, Validators.min(0.01)]],
    modePaiement:     ['', Validators.required],
    referenceBancaire:[''],
  });

  get f() { return this.form.controls; }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    this.svc.recordPayment(this.invoice().id, {
      dateReglement:    v.dateReglement!,
      montant:          v.montant!,
      modePaiement:     v.modePaiement!,
      referenceBancaire:v.referenceBancaire?.trim() || null,
    }).subscribe({
      next:  () => { this.saving.set(false); this.closed.emit(true); },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur lors de l\'enregistrement.'); },
    });
  }

  cancel(): void { this.closed.emit(false); }

  onOverlay(e: MouseEvent): void {
    if ((e.target as HTMLElement).classList.contains('overlay')) this.cancel();
  }

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
