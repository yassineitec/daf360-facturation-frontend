import { AfterViewInit, Component, DestroyRef, TemplateRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  FormFieldComponent, FormFieldOptions, ModalButton, ModalRef, ModalService,
  SelectComponent, SelectConfig, SelectOption,
} from '@khalilrebhiitec/daf360';
import { InvoiceService } from '../invoice.service';
import { InvoiceDetail, CREDIT_NOTE_REASONS } from '../invoice.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/**
 * « Émettre un avoir » — daf modal (ModalService), redimensionnable et agrandissable.
 *
 * Monté par la fiche sous `@if (showCreditNote())` : la modale s'ouvre à la création du
 * composant et `(closed)` est émis quelle que soit la sortie (Annuler, ✕, fond, avoir émis),
 * pour que la page remette son signal à faux.
 */
@Component({
  selector: 'app-credit-note-modal',
  imports: [DisplayCurrencyPipe, SelectComponent, FormFieldComponent],
  template: `
<ng-template #bodyTpl>
  <div class="invoice-summary">
    <span class="inv-num">{{ invoice().invoiceNumber ?? '—' }}</span>
    <span class="inv-client">{{ invoice().clientNom }}</span>
    <span class="inv-amount">{{ invoice().montantTtc | displayCurrency : invoice().devise }}</span>
  </div>

  <div class="modal-body">
    <daf-select
      [options]="reasonOptions()"
      [config]="reasonConfig()"
      [selected]="reasonCode() ? [reasonCode()] : []"
      (selectedChange)="reasonCode.set($event.length ? $event[0] : '')" />

    <daf-form-field
      [options]="detailOptions()"
      [value]="reasonText()"
      (valueChange)="reasonText.set($event == null ? '' : '' + $event)" />

    <daf-form-field
      [options]="amountOptions()"
      [value]="montantTtc()"
      (valueChange)="onAmountChange($event)" />

    @if (serverError()) {
      <div class="server-error">{{ serverError() }}</div>
    }
  </div>
</ng-template>
  `,
  styleUrl: './credit-note-modal.component.scss',
})
export class CreditNoteModalComponent implements AfterViewInit {
  private readonly svc = inject(InvoiceService);
  private readonly translate = inject(TranslateService);
  private readonly modal = inject(ModalService);

  invoice = input.required<InvoiceDetail>();
  closed  = output<boolean>();

  saving      = signal(false);
  serverError = signal<string | null>(null);

  private readonly bodyTpl = viewChild.required<TemplateRef<unknown>>('bodyTpl');
  private modalRef: ModalRef | null = null;
  /** Vrai une fois l'avoir émis : la fermeture qui suit le signale à la page. */
  private saved = false;

  readonly reasonCode = signal('');
  readonly reasonText = signal('');
  readonly montantTtc = signal<number | null>(null);
  /** Passe à vrai au premier « Émettre » : les erreurs de champ ne s'affichent qu'ensuite. */
  private readonly submitted = signal(false);

  readonly reasonOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return Object.entries(CREDIT_NOTE_REASONS)
      .map(([value, key]) => ({ value, label: this.translate.instant(key) }));
  });

  readonly reasonConfig = computed<SelectConfig>(() => {
    this.translate.currentLang();
    return {
      label:       this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.REASON_LABEL'),
      placeholder: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.REASON_SELECT'),
      fullWidth:   true,
      error: this.submitted() && !this.reasonCode()
        ? this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.REASON_REQUIRED')
        : undefined,
    };
  });

  readonly detailOptions = computed<FormFieldOptions>(() => {
    this.translate.currentLang();
    return {
      type:        'textarea',
      label:       this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.DETAIL_LABEL'),
      placeholder: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.DETAIL_PLACEHOLDER'),
      rows:        3,
      maxLength:   500,
      fullWidth:   true,
    };
  });

  readonly amountOptions = computed<FormFieldOptions>(() => {
    this.translate.currentLang();
    return {
      type:        'number',
      label:       this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.AMOUNT_LABEL', { currency: this.invoice().devise }),
      placeholder: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.AMOUNT_PLACEHOLDER'),
      hint:        this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.AMOUNT_HINT'),
      fullWidth:   true,
    };
  });

  /** '' (champ vidé) → null : « avoir total », pas un montant de 0. */
  onAmountChange(v: string | number | null): void {
    if (v === null || v === '') { this.montantTtc.set(null); return; }
    const n = typeof v === 'number' ? v : Number(v);
    this.montantTtc.set(isNaN(n) ? null : n);
  }

  constructor() {
    // Page quittée modale ouverte : elle vit sous <body>, on la ferme avec le composant.
    inject(DestroyRef).onDestroy(() => this.modalRef?.close());
  }

  ngAfterViewInit(): void {
    // Getters : le bouton suit l'envoi en cours, comme l'ancien bouton du formulaire.
    const self = this;
    const submitBtn: ModalButton = {
      get label()    { return self.translate.instant(self.saving() ? 'INVOICING.CREDIT_NOTE_MODAL.SAVING' : 'INVOICING.CREDIT_NOTE_MODAL.SUBMIT'); },
      get disabled() { return self.saving(); },
      variant: 'primary',
      icon:    'receipt_long',
      action:  () => this.submit(),
    };

    const ref = this.modal.open({
      title: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.TITLE'),
      icon:  'receipt_long',
      body:  this.bodyTpl(),
      size:  'md',
      minWidth:    '360px',
      minHeight:   '260px',
      resizable:   true,
      maximizable: true,
      buttons: [
        { label: this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.CANCEL'), variant: 'secondary', action: r => r.close() },
        submitBtn,
      ],
    });

    // ✕, fond, Annuler et fermeture après émission aboutissent tous à _destroy().
    const destroy = ref._destroy.bind(ref);
    ref._destroy = () => {
      destroy();
      this.modalRef = null;
      this.closed.emit(this.saved);
    };
    this.modalRef = ref;
  }

  submit(): void {
    if (this.saving()) return;
    this.submitted.set(true);
    if (!this.reasonCode()) return;
    this.serverError.set(null);
    const v = { reasonCode: this.reasonCode(), reasonText: this.reasonText(), montantTtc: this.montantTtc() };

    // The backend has no partial-credit-note support yet: CreateCreditNoteRequest has no
    // amount field, and an empty `lines` list always credits the ORIGINAL invoice's lines
    // in full (see InvoiceService.createCreditNote). Silently accepting a smaller amount
    // here would issue a full-amount avoir without telling anyone — so until that's
    // implemented, a partial amount is refused client-side instead of ignored server-side.
    if (v.montantTtc != null && Math.abs(v.montantTtc - this.invoice().montantTtc) > 0.01) {
      this.serverError.set(this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.PARTIAL_NOT_SUPPORTED'));
      return;
    }

    this.saving.set(true);
    this.svc.createCreditNote(this.invoice().id, {
      creditNoteReason: v.reasonCode,
      creditNoteReasonFree: v.reasonText?.trim() || null,
      montantTtc: v.montantTtc ?? null,
    }).subscribe({
      next:  () => { this.saving.set(false); this.saved = true; this.modalRef?.close(); },
      error: err => { this.saving.set(false); this.serverError.set(err?.error?.message ?? this.translate.instant('INVOICING.CREDIT_NOTE_MODAL.SAVE_ERROR')); },
    });
  }
}
