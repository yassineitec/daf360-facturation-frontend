import { AfterViewInit, Component, OnDestroy, TemplateRef, inject, input, output, signal, viewChild } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ModalService, ModalRef } from '@khalilrebhiitec/daf360';
import { InvoiceService } from '../invoice.service';
import { InvoiceDetail, CREDIT_NOTE_REASONS } from '../invoice.model';

/**
 * Credit-note dialog rendered through the lib ModalService (its chrome + primary/
 * secondary daf-buttons). Public API (invoice input, closed output) is unchanged so
 * the parent still shows it via `@if (target()) <app-credit-note-modal>`. The body
 * (invoice summary, reactive form, error) lives in the #body TemplateRef; the modal is
 * opened in ngAfterViewInit and closed on destroy when the parent removes the component.
 */
@Component({
  selector: 'app-credit-note-modal',
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
    <ng-template #body>
      <div class="invoice-summary">
        <span class="inv-num">{{ invoice().invoiceNumber ?? '—' }}</span>
        <span class="inv-client">{{ invoice().clientNom }}</span>
        <span class="inv-amount">{{ formatAmount(invoice().montantTtc, invoice().devise) }}</span>
      </div>

      <form [formGroup]="form" class="modal-body">
        <div class="field">
          <label for="cn-reason">{{ 'INVOICING.CREDIT_NOTE_MODAL.REASON_LABEL' | translate }}</label>
          <select id="cn-reason" formControlName="reasonCode" class="form-input"
            [class.invalid]="f['reasonCode'].invalid && f['reasonCode'].touched">
            <option value="">{{ 'INVOICING.CREDIT_NOTE_MODAL.REASON_SELECT' | translate }}</option>
            @for (opt of reasonOptions; track opt.value) {
              <option [value]="opt.value">{{ opt.label | translate }}</option>
            }
          </select>
          @if (f['reasonCode'].invalid && f['reasonCode'].touched) {
            <span class="error-msg">{{ 'INVOICING.CREDIT_NOTE_MODAL.REASON_REQUIRED' | translate }}</span>
          }
        </div>

        <div class="field">
          <label for="cn-text">{{ 'INVOICING.CREDIT_NOTE_MODAL.DETAIL_LABEL' | translate }}</label>
          <textarea id="cn-text" formControlName="reasonText" class="form-input" rows="3"
            maxlength="500"
            [placeholder]="'INVOICING.CREDIT_NOTE_MODAL.DETAIL_PLACEHOLDER' | translate"></textarea>
        </div>

        <div class="field">
          <label for="cn-amount">
            {{ 'INVOICING.CREDIT_NOTE_MODAL.AMOUNT_LABEL' | translate: { currency: invoice().devise } }}
          </label>
          <input id="cn-amount" type="number" formControlName="montantTtc" class="form-input"
            step="0.01" min="0.01" [attr.max]="invoice().montantTtc"
            [placeholder]="'INVOICING.CREDIT_NOTE_MODAL.AMOUNT_PLACEHOLDER' | translate" />
          <span class="field-hint">{{ 'INVOICING.CREDIT_NOTE_MODAL.AMOUNT_HINT' | translate }}</span>
        </div>

        @if (serverError()) {
          <div class="server-error">{{ serverError() }}</div>
        }
      </form>
    </ng-template>
  `,
  styles: [`
    .invoice-summary { display: flex; align-items: center; gap: 12px; padding: 10px 12px; background: var(--color-surface-container, #f8fafc); border-radius: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    .inv-num    { font-family: 'Courier New', monospace; font-weight: 700; font-size: 0.8rem; color: var(--color-primary, #0f3d47); }
    .inv-client { font-size: 0.875rem; color: var(--color-on-surface-variant, #475569); flex: 1; }
    .inv-amount { font-weight: 700; color: #1a6b7c; font-size: 0.9rem; margin-left: auto; }
    .modal-body { display: flex; flex-direction: column; gap: 13px; }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field label { font-size: 0.8125rem; font-weight: 600; color: var(--color-on-surface, #374151); }
    .form-input { padding: 8px 11px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 0.875rem; color: #0f172a; background: #fff; width: 100%; box-sizing: border-box; }
    .form-input:focus { outline: none; border-color: #1a6b7c; box-shadow: 0 0 0 2px rgba(26,107,124,0.1); }
    .form-input.invalid { border-color: #f87171; }
    textarea.form-input { resize: vertical; font-family: inherit; }
    .field-hint { font-size: 0.75rem; color: #94a3b8; }
    .error-msg { font-size: 0.75rem; color: #dc2626; }
    .server-error { padding: 9px 12px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; font-size: 0.8125rem; color: #991b1b; }
  `],
})
export class CreditNoteModalComponent implements AfterViewInit, OnDestroy {
  private readonly fb        = inject(FormBuilder);
  private readonly svc       = inject(InvoiceService);
  private readonly translate = inject(TranslateService);
  private readonly modal     = inject(ModalService);

  private readonly body = viewChild.required<TemplateRef<unknown>>('body');
  private ref: ModalRef | null = null;

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

  ngAfterViewInit(): void {
    this.ref = this.modal.open({
      title: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.TITLE'),
      icon: 'receipt_long',
      body: this.body(),
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.CANCEL'), variant: 'secondary', action: _r => this.cancel() },
        { label: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.SUBMIT'), variant: 'primary', icon: 'check', action: _r => this.submit() },
      ],
    });
  }

  ngOnDestroy(): void {
    this.ref?.close();
    this.ref = null;
  }

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

  formatAmount(v: number, devise = 'TND'): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: devise,
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
