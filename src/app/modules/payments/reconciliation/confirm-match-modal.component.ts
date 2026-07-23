import { AfterViewInit, Component, OnDestroy, TemplateRef, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import { ModalService, ModalRef } from '@khalilrebhiitec/daf360';
import { ReconciliationService } from '../reconciliation.service';
import { BankTransaction } from '../payment.model';

/**
 * Confirm-match dialog rendered through the lib ModalService (its chrome + primary/
 * secondary daf-buttons). Public API (tx input, dismissed/confirmed outputs) is
 * unchanged so the parent still shows it via `@if (target()) <app-confirm-match-modal>`.
 * The body (message, confidence, error) lives in the #body TemplateRef; the modal is
 * opened in ngAfterViewInit and closed on destroy when the parent removes the component.
 */
@Component({
  selector: 'app-confirm-match-modal',
  imports: [TranslatePipe],
  template: `
    <ng-template #body>
      <p class="confirm-text" [innerHTML]="'PAYMENTS.CONFIRM.TEXT' | translate: {
          amount: formatAmount(tx().montant, tx().devise),
          date: formatDate(tx().transactionDate),
          invoice: tx().proposedInvoiceNumber ?? ('PAYMENTS.CONFIRM.UNKNOWN_INVOICE' | translate),
          client: tx().proposedClientNom ?? ('PAYMENTS.CONFIRM.UNKNOWN_CLIENT' | translate)
        }"></p>

      @if (tx().confidence !== null) {
        <div class="confidence-row">
          <span class="conf-label">{{ 'PAYMENTS.CONFIRM.CONFIDENCE' | translate }}</span>
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
    </ng-template>
  `,
  styles: [`
    .confirm-text { font-size: 0.9375rem; color: var(--color-on-surface-variant, #334155); line-height: 1.6; margin: 0 0 1rem; }
    .confidence-row {
      display: flex; align-items: center; gap: 0.75rem;
      padding: 0.5rem 0.75rem; background: var(--color-surface-container, #f8fafc); border-radius: 6px; margin-bottom: 0.25rem;
    }
    .conf-label { font-size: 0.8rem; color: var(--color-on-surface-variant, #64748b); font-weight: 500; }
    .conf-val { font-weight: 700; font-size: 0.875rem; }
    .conf-high  { color: #065f46; }
    .conf-med   { color: #92400e; }
    .conf-low   { color: #991b1b; }
    .modal-error {
      background: #fee2e2; border: 1px solid #fca5a5; border-radius: 6px;
      color: #991b1b; padding: 0.625rem 0.875rem; font-size: 0.875rem; margin-top: 1rem;
    }
  `],
})
export class ConfirmMatchModalComponent implements AfterViewInit, OnDestroy {
  private readonly svc       = inject(ReconciliationService);
  private readonly translate = inject(TranslateService);
  private readonly modal     = inject(ModalService);

  private readonly body = viewChild.required<TemplateRef<unknown>>('body');
  private ref: ModalRef | null = null;

  tx        = input.required<BankTransaction>();
  dismissed = output<void>();
  confirmed = output<void>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  ngAfterViewInit(): void {
    this.ref = this.modal.open({
      title: this.translate.instant('PAYMENTS.CONFIRM.TITLE'),
      icon: 'fact_check',
      body: this.body(),
      size: 'md',
      closeOnBackdrop: false,
      buttons: [
        { label: this.translate.instant('PAYMENTS.COMMON.CANCEL'), variant: 'secondary', action: _r => this.dismissed.emit() },
        { label: this.translate.instant('PAYMENTS.CONFIRM.CONFIRM_BTN'), variant: 'primary', icon: 'check', action: _r => this.confirm() },
      ],
    });
  }

  ngOnDestroy(): void {
    this.ref?.close();
    this.ref = null;
  }

  confirm(): void {
    const invoiceId = this.tx().proposedInvoiceId;
    if (!invoiceId) return;
    this.saving.set(true);
    this.serverError.set(null);
    this.svc.confirmMatch(this.tx().id, invoiceId).subscribe({
      next:  () => { this.saving.set(false); this.confirmed.emit(); },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? this.translate.instant('PAYMENTS.CONFIRM.ERROR'));
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
