import { Component, inject, output, signal } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { SelectComponent, SelectOption, FormFieldComponent } from '@khalilrebhiitec/daf360';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction } from '../payment.model';

const DEVISES = ['TND', 'EUR', 'USD', 'GBP', 'CHF'];

@Component({
  selector: 'app-manual-transaction-modal',
  imports: [SelectComponent, FormFieldComponent, TranslatePipe],
  template: `
<div class="modal-backdrop" (click)="dismissed.emit()">
  <div class="modal-box" (click)="$event.stopPropagation()">
    <h3 class="modal-title">{{ 'PAYMENTS.MANUAL_TX.TITLE' | translate }}</h3>

    <div class="info-banner" [innerHTML]="'PAYMENTS.MANUAL_TX.INFO' | translate: { status: ('PAYMENTS.STATUT.UNMATCHED' | translate) }"></div>

    <div class="fields-grid">
      <div class="field-section">
        <daf-form-field
          [options]="{ type: 'date', label: ('PAYMENTS.MANUAL_TX.DATE' | translate), required: true, fullWidth: true }"
          [(value)]="form.transactionDate" />
      </div>

      <div class="field-section amount-row">
        <div class="field-section" style="flex:1">
          <daf-form-field
            [options]="{ type: 'number', label: ('PAYMENTS.MANUAL_TX.AMOUNT' | translate), required: true, placeholder: '0.000', fullWidth: true }"
            [value]="form.amount"
            (valueChange)="form.amount = +($event ?? 0)" />
        </div>
        <div class="field-section" style="width:90px">
          <daf-select
            [options]="currencyOptions"
            [selected]="[form.currency]"
            [config]="{ label: ('PAYMENTS.MANUAL_TX.CURRENCY' | translate), fullWidth: true }"
            (selectedChange)="form.currency = $event[0] || 'TND'" />
        </div>
      </div>

      <div class="field-section full">
        <daf-form-field
          [options]="{ label: ('PAYMENTS.MANUAL_TX.REFERENCE' | translate), placeholder: ('PAYMENTS.MANUAL_TX.REF_PH' | translate), maxLength: 255, fullWidth: true }"
          [value]="form.reference"
          (valueChange)="form.reference = ($event ?? '') + ''" />
      </div>

      <div class="field-section full">
        <daf-form-field
          [options]="{ type: 'textarea', label: ('PAYMENTS.MANUAL_TX.DESCRIPTION' | translate), placeholder: ('PAYMENTS.MANUAL_TX.DESC_PH' | translate), rows: 2, maxLength: 500, fullWidth: true }"
          [value]="form.description"
          (valueChange)="form.description = ($event ?? '') + ''" />
      </div>
    </div>

    @if (serverError()) {
      <div class="modal-error">{{ serverError() }}</div>
    }

    <div class="modal-actions">
      <button class="btn-cancel" [disabled]="saving()" (click)="dismissed.emit()">{{ 'PAYMENTS.COMMON.CANCEL' | translate }}</button>
      <button class="btn-confirm" [disabled]="saving() || !canSubmit()" (click)="submit()">
        {{ (saving() ? 'PAYMENTS.COMMON.SAVING' : 'PAYMENTS.MANUAL_TX.CREATE_BTN') | translate }}
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
      background: #fff; border-radius: 12px; padding: 2rem; width: 520px; max-width: 95vw;
      box-shadow: 0 20px 60px rgba(0,0,0,0.18); display: flex; flex-direction: column; gap: 1.125rem;
    }
    .modal-title { font-size: 1.125rem; font-weight: 700; color: #0f172a; margin: 0; }
    .info-banner {
      background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;
      padding: 0.75rem; font-size: 0.8rem; color: #0369a1; line-height: 1.5;
    }
    .fields-grid { display: flex; flex-direction: column; gap: 0.875rem; }
    .field-section { display: flex; flex-direction: column; gap: 0.375rem; }
    .full { width: 100%; }
    .amount-row { flex-direction: row; align-items: flex-end; gap: 0.5rem; }
    .field-label { font-size: 0.8rem; font-weight: 500; color: #374151; }
    .required { color: #dc2626; }
    .optional { font-weight: 400; color: #94a3b8; }
    .field-input {
      height: 36px; padding: 0 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    .field-select {
      height: 36px; padding: 0 0.5rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a; background: #fff; cursor: pointer;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
    }
    .field-textarea {
      padding: 0.5rem 0.75rem; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: 0.875rem; color: #0f172a; resize: vertical; font-family: inherit;
      &:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 2px rgba(59,130,246,0.15); }
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
      background: #0f172a; color: #fff; font-size: 0.875rem; font-weight: 600; cursor: pointer;
      &:hover:not(:disabled) { background: #1e293b; }
      &:disabled { opacity: 0.5; cursor: default; }
    }
  `],
})
export class ManualTransactionModalComponent {
  private readonly svc       = inject(ReconciliationService);
  private readonly translate = inject(TranslateService);

  dismissed = output<void>();
  confirmed = output<BankTransaction>();

  readonly currencyOptions: SelectOption[] = DEVISES.map(d => ({ value: d, label: d }));

  form = { transactionDate: '', amount: 0, currency: 'TND', reference: '', description: '' };
  saving      = signal(false);
  serverError = signal<string | null>(null);

  canSubmit(): boolean {
    return !!this.form.transactionDate && this.form.amount > 0;
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.createManualTransaction({
      transactionDate: this.form.transactionDate,
      amount:          this.form.amount,
      currency:        this.form.currency || undefined,
      reference:       this.form.reference.trim()   || undefined,
      description:     this.form.description.trim() || undefined,
    }).subscribe({
      next:  tx  => { this.saving.set(false); this.confirmed.emit(tx); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? this.translate.instant('PAYMENTS.MANUAL_TX.ERROR'));
      },
    });
  }
}
