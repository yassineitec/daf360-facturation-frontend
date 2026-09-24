import { Component, TemplateRef, ViewChild, computed, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ButtonComponent, FormFieldComponent, ModalRef, ModalService,
  MultiDatePickerComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { InvoiceService } from './invoice.service';
import { InvoiceListItem, InvoiceDetail, PAYMENT_MODES } from './invoice.model';
import { DisplayCurrencyPipe } from '../../shared/display-currency.pipe';

/**
 * « Enregistrer un paiement » — un dialogue `ModalService`, même construction que
 * `app-reglement-modal` (cost/modals) : on monte le composant UNE fois, sans `@if`
 * (`<app-payment-modal #paymentModal />`), et on appelle `.open(invoice, onSaved)`.
 *
 * Pourquoi plus de `@if` + `(closed)` : le ✕ de l'en-tête et le fond du dialogue ferment
 * via la lib, qui n'expose aucun rappel de fermeture — l'appelant ne saurait jamais que
 * l'utilisateur a abandonné, son drapeau resterait à `true` et le bouton ne rouvrirait
 * plus rien. `onSaved` n'est appelé qu'après un enregistrement réussi.
 *
 * Enregistrer/Annuler vivent dans le corps plutôt que dans `ModalConfig.buttons` : ce
 * tableau est un instantané non réactif, et `saving()` doit piloter le spinner.
 *
 * ── Source des modes de paiement ─────────────────────────────────────────────────
 * `PAYMENT_MODES` (invoice.model.ts) : 4 codes FIGÉS côté front — VIREMENT, CHEQUE,
 * ESPECES, AUTRE — chacun associé à une clé i18n `INVOICING.PAYMENT_MODE.*`. Le code
 * part tel quel dans `RecordPaymentRequest.paymentMethod` et est stocké en texte libre
 * dans `payments.payment_method` : le backend (InvoiceService.recordPayment) ne le
 * valide contre aucune liste. Ce n'est PAS la liste configurable `PAYMENT_METHOD`
 * (Admin → Listes, V12) utilisée par les lignes de coût, même si ses codes coïncident.
 */
@Component({
  selector: 'app-payment-modal',
  standalone: true,
  imports: [
    TranslatePipe, DisplayCurrencyPipe,
    FormFieldComponent, MultiDatePickerComponent, SelectComponent, ButtonComponent,
  ],
  template: `
    <ng-template #tpl>
      <div class="flex flex-col gap-4">

        <!-- La facture concernée : rappel en lecture seule, même bloc que la ligne de
             coût dans app-reglement-modal. -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl bg-surface-container p-3">
          <div class="flex min-w-0 flex-1 flex-col gap-0.5">
            <span class="text-body-md font-bold text-on-surface">
              {{ invoice()?.invoiceNumber ?? ('INVOICING.PAYMENT_MODAL.DRAFT' | translate) }}
            </span>
            <span class="daf-text-truncate text-body-sm text-on-surface-variant">{{ invoice()?.clientNom }}</span>
          </div>
          <div class="flex flex-col items-end gap-0.5">
            <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
              {{ 'INVOICING.PAYMENT_MODAL.TOTAL_TTC' | translate }}
            </span>
            <span class="text-body-md font-bold text-on-surface">
              {{ invoice()?.montantTtc | displayCurrency : invoice()?.devise }}
            </span>
          </div>
        </div>

        <daf-multi-date-picker
          [config]="{
            label: ('INVOICING.PAYMENT_MODAL.DATE_LABEL' | translate), required: true,
            error: (touched() && !dateIso()) ? ('INVOICING.PAYMENT_MODAL.DATE_REQUIRED' | translate) : undefined
          }"
          [value]="dateValue()"
          (valueChange)="setDate($any($event))" />

        <daf-form-field
          [options]="{
            label: ('INVOICING.PAYMENT_MODAL.AMOUNT_LABEL' | translate:{ devise: invoice()?.devise }),
            type: 'number', required: true, placeholder: '0.00',
            error: (touched() && !(montant()! > 0)) ? ('INVOICING.PAYMENT_MODAL.AMOUNT_REQUIRED' | translate) : undefined
          }"
          [value]="montant()"
          (valueChange)="montant.set($event === null || $event === '' ? null : +$event)" />

        <daf-select
          [options]="modeOptions()"
          [selected]="mode() ? [mode()] : []"
          [config]="{
            label: ('INVOICING.PAYMENT_MODAL.MODE_LABEL' | translate),
            placeholder: ('INVOICING.PAYMENT_MODAL.MODE_SELECT' | translate),
            required: true,
            error: (touched() && !mode()) ? ('INVOICING.PAYMENT_MODAL.MODE_REQUIRED' | translate) : undefined
          }"
          (selectedChange)="mode.set($event[0] || '')" />

        <daf-form-field
          [options]="{
            label: ('INVOICING.PAYMENT_MODAL.REF_LABEL' | translate),
            placeholder: ('INVOICING.PAYMENT_MODAL.REF_PLACEHOLDER' | translate),
            maxLength: 100
          }"
          [value]="reference()"
          (valueChange)="reference.set($any($event) ?? '')" />

        @if (serverError()) {
          <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">
            {{ serverError() }}
          </div>
        }

        <div class="flex justify-end gap-2.5 pt-1">
          <daf-button
            [label]="'INVOICING.PAYMENT_MODAL.CANCEL' | translate"
            variant="secondary"
            [options]="{ disabled: saving() }"
            (onClick)="modalRef?.close()" />
          <daf-button
            [label]="'INVOICING.PAYMENT_MODAL.SAVE' | translate"
            variant="primary"
            [options]="{ iconStart: 'payments', loading: saving(), disabled: saving() }"
            (onClick)="submit()" />
        </div>

      </div>
    </ng-template>
  `,
})
export class PaymentModalComponent {
  @ViewChild('tpl', { static: true }) private tpl!: TemplateRef<unknown>;

  private readonly svc       = inject(InvoiceService);
  private readonly modal     = inject(ModalService);
  private readonly translate = inject(TranslateService);

  protected modalRef?: ModalRef;
  private onSaved?: () => void;

  readonly invoice     = signal<InvoiceListItem | InvoiceDetail | null>(null);
  readonly dateIso     = signal('');
  readonly montant     = signal<number | null>(null);
  readonly mode        = signal('');
  readonly reference   = signal('');
  readonly saving      = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly touched     = signal(false);

  /** Codes of `PAYMENT_MODES`, labels translated — see the class comment for the source. */
  readonly modeOptions = computed<SelectOption[]>(() => {
    this.translate.currentLang();
    return Object.entries(PAYMENT_MODES)
      .map(([value, key]) => ({ value, label: this.translate.instant(key) }));
  });

  /** `daf-multi-date-picker` works in `Date`; the API wants yyyy-MM-dd — same pattern as app-reglement-modal. */
  readonly dateValue = computed<Date | null>(() => {
    const iso = this.dateIso();
    if (!iso) return null;
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  });

  setDate(v: Date | Date[] | null): void {
    const d = Array.isArray(v) ? v[0] : v;
    this.dateIso.set(d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '');
  }

  open(invoice: InvoiceListItem | InvoiceDetail, onSaved: () => void): void {
    this.invoice.set(invoice);
    this.onSaved = onSaved;
    this.setDate(new Date());
    this.montant.set(null);
    this.mode.set('');
    this.reference.set('');
    this.touched.set(false);
    this.saving.set(false);
    this.serverError.set(null);

    this.modalRef = this.modal.open({
      title: this.translate.instant('INVOICING.PAYMENT_MODAL.TITLE'),
      icon:  'payments',
      body:  this.tpl,
      size:  'md',
      closeOnBackdrop: false,
    });
  }

  private get canSave(): boolean {
    return !!this.dateIso() && (this.montant() ?? 0) > 0 && !!this.mode();
  }

  submit(): void {
    this.touched.set(true);
    const invoice = this.invoice();
    if (!invoice || !this.canSave) return;
    this.saving.set(true);
    this.serverError.set(null);

    this.svc.recordPayment(invoice.id, {
      paymentDate:   this.dateIso(),
      amountLocal:   this.montant()!,
      paymentMethod: this.mode(),
      bankReference: this.reference().trim() || null,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.modalRef?.close();
        this.onSaved?.();
      },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err?.error?.message ?? this.translate.instant('INVOICING.PAYMENT_MODAL.ERROR'));
      },
    });
  }
}
