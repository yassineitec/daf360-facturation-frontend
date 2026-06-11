import { Component, inject, input, output, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { InvoiceService } from './invoice.service';
import { InvoiceDetail, CREDIT_NOTE_REASONS } from './invoice.model';

@Component({
  selector: 'app-credit-note-modal',
  imports: [ReactiveFormsModule],
  template: `
<div class="overlay" (click)="onOverlay($event)">
  <div class="modal">
    <div class="modal-header">
      <h2>Émettre un avoir</h2>
      <button class="close-btn" type="button" (click)="cancel()">&times;</button>
    </div>

    <div class="invoice-summary">
      <span class="inv-num">{{ invoice().invoiceNumber ?? '—' }}</span>
      <span class="inv-client">{{ invoice().clientNom }}</span>
      <span class="inv-amount">{{ formatAmount(invoice().montantTtc, invoice().devise) }}</span>
    </div>

    <form [formGroup]="form" (ngSubmit)="submit()" class="modal-body">
      <div class="field">
        <label for="cn-reason">Motif *</label>
        <select id="cn-reason" formControlName="reasonCode" class="form-input"
          [class.invalid]="f['reasonCode'].invalid && f['reasonCode'].touched">
          <option value="">Sélectionner un motif…</option>
          @for (opt of reasonOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label }}</option>
          }
        </select>
        @if (f['reasonCode'].invalid && f['reasonCode'].touched) {
          <span class="error-msg">Motif requis.</span>
        }
      </div>

      <div class="field">
        <label for="cn-text">Détail / commentaire</label>
        <textarea id="cn-text" formControlName="reasonText" class="form-input" rows="3"
          maxlength="500" placeholder="Précisions optionnelles…"></textarea>
      </div>

      <div class="field">
        <label for="cn-amount">Montant TTC de l'avoir ({{ invoice().devise }})</label>
        <input id="cn-amount" type="number" formControlName="montantTtc" class="form-input"
          step="0.01" min="0.01" [attr.max]="invoice().montantTtc"
          placeholder="Laisser vide pour avoir total" />
        <span class="field-hint">Si vide, l'avoir sera égal au montant total de la facture.</span>
      </div>

      @if (serverError()) {
        <div class="server-error">{{ serverError() }}</div>
      }

      <div class="modal-actions">
        <button type="button" class="btn-cancel" (click)="cancel()">Annuler</button>
        <button type="submit" class="btn-save btn-save--warning" [disabled]="saving()">
          {{ saving() ? 'Émission…' : 'Émettre l\'avoir' }}
        </button>
      </div>
    </form>
  </div>
</div>
  `,
  styleUrl: './credit-note-modal.component.scss',
})
export class CreditNoteModalComponent {
  private readonly fb  = inject(FormBuilder);
  private readonly svc = inject(InvoiceService);

  invoice = input.required<InvoiceDetail>();
  closed  = output<boolean>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  readonly reasonOptions = Object.entries(CREDIT_NOTE_REASONS)
    .map(([value, label]) => ({ value, label }));

  form = this.fb.group({
    reasonCode: ['', Validators.required],
    reasonText: [''],
    montantTtc: [null as number | null],
  });

  get f() { return this.form.controls; }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.saving.set(true);
    this.serverError.set(null);
    const v = this.form.getRawValue();
    this.svc.createCreditNote(this.invoice().id, {
      reasonCode: v.reasonCode!,
      reasonText: v.reasonText?.trim() || null,
      montantTtc: v.montantTtc ?? null,
    }).subscribe({
      next:  () => { this.saving.set(false); this.closed.emit(true); },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? 'Erreur lors de l\'émission de l\'avoir.'); },
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
