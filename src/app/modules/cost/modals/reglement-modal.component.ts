import {
  Component, TemplateRef, ViewChild, inject, signal,
} from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  ButtonComponent, FormFieldComponent, ModalRef, ModalService,
  MultiDatePickerComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { CostInvoiceDto, CostInvoiceReglementDto, formatAmount } from '../cost.model';
import { CostService } from '../cost.service';
import { FactListService } from '../../../core/fact-list.service';

/**
 * What `open()` takes. Since V93 a règlement pays a COST INVOICE (one règlement per
 * invoice), never a single cost line.
 *
 * Three ways in:
 *  - edit: `editing` set — the invoice is fixed to `editing.costInvoiceId`.
 *  - create for a known invoice: `costInvoiceId` (+ `expectedAmount` = the invoice's
 *    `netToPay`, proposed as the default "montant payé"; optional `invoiceReference` /
 *    `supplierInvoiceNumber` shown in the header box).
 *  - create with a picker: `payableInvoices` (no `costInvoiceId`) — the user chooses one;
 *    a single-element array is auto-selected. The default amount is the chosen invoice's
 *    `netToPay`.
 */
export interface ReglementModalData {
  /** null when creating a NEW règlement; set when editing an existing one. */
  editing: CostInvoiceReglementDto | null;
  /** Create mode: the invoice to pay (hides the picker). */
  costInvoiceId?: number | null;
  /** Default "montant payé" — callers pass `invoice.netToPay` (TTC − retenue à la source). */
  expectedAmount?: number | null;
  /** Display only: the invoice's internal reference. */
  invoiceReference?: string | null;
  /** Display only: the supplier's own invoice number. */
  supplierInvoiceNumber?: string | null;
  /** Display only: currency of `expectedAmount`. */
  currency?: string | null;
  /** Which country's PAYMENT_METHOD list to fetch — callers pass `invoice.paysId`. Same
   *  "caller already knows it, pass it directly" reasoning as `currency`/`invoiceReference`
   *  above: `findPayable()` below can't always resolve the invoice (e.g. edit mode when the
   *  invoice isn't in the caller's already-loaded list). */
  paysId?: number | null;
  /** Create mode without `costInvoiceId`: the payable (APPROVED, unpaid) invoices to pick from. */
  payableInvoices?: CostInvoiceDto[];
}

/**
 * Owns one `ModalService`-backed dialog, reused by both call sites (cost list and cost
 * invoice detail) — mount once per caller (`<app-reglement-modal #reglementModal />`,
 * unconditionally, no `@if`) and call `.open(data, onResolved)`. The `<ng-template>` here
 * is only ever rendered inside the library's own dialog chrome, never on its own.
 *
 * Save/Cancel live inside the template body rather than `ModalConfig.buttons` — that array
 * is a non-reactive snapshot, and `saving()` needs to keep driving the confirm button's
 * spinner (same convention as employee-cost.component.ts's own modal).
 */
@Component({
  selector: 'app-reglement-modal',
  standalone: true,
  imports: [
    TranslatePipe, SelectComponent, FormFieldComponent, MultiDatePickerComponent, ButtonComponent,
  ],
  template: `
    <ng-template #tpl>
      <div class="flex flex-col gap-4">

        @if (fixedInvoice()) {
          <div class="flex flex-col gap-1 rounded-xl bg-surface-container p-3">
            <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
              {{ 'COST.REGLEMENT.INVOICE' | translate }}
            </span>
            <span class="text-body-md font-bold text-on-surface">
              {{ invoiceReference() || ('COST.REGLEMENT.INVOICE_NUMBER' | translate:{ id: costInvoiceId() }) }}
            </span>
            @if (supplierInvoiceNumber()) {
              <span class="text-body-sm text-on-surface-variant">
                {{ 'COST.REGLEMENT.SUPPLIER_INVOICE_NUMBER' | translate:{ number: supplierInvoiceNumber() } }}
              </span>
            }
          </div>
        } @else {
          <daf-select
            [options]="invoiceOptions()"
            [selected]="costInvoiceId() != null ? [costInvoiceId()!.toString()] : []"
            [config]="{
              label: ('COST.REGLEMENT.INVOICE_PICKER' | translate),
              placeholder: ('COST.REGLEMENT.INVOICE_PICKER_PLACEHOLDER' | translate),
              required: true,
              searchable: true,
              error: (touched() && costInvoiceId() == null) ? ('COST.REGLEMENT.ERR_INVOICE_REQUIRED' | translate) : undefined
            }"
            (selectedChange)="onInvoiceSelected($event)" />
        }

        <daf-form-field
          [options]="{
            label: ('COST.REGLEMENT.AMOUNT' | translate), type: 'number', required: true,
            hint: expectedAmount() != null ? ('COST.REGLEMENT.NET_TO_PAY_HINT' | translate:{ amount: expectedAmountLabel() }) : undefined,
            error: (touched() && !(montantPaye()! > 0)) ? ('COST.REGLEMENT.ERR_AMOUNT_REQUIRED' | translate) : undefined
          }"
          [value]="montantPaye()"
          (valueChange)="montantPaye.set($any($event))" />

        <daf-select
          [options]="paymentMethodOptions()"
          [selected]="paymentMethodId() != null ? [paymentMethodId()!.toString()] : []"
          [config]="{
            label: ('COST.REGLEMENT.PAYMENT_METHOD' | translate),
            placeholder: ('COST.REGLEMENT.PAYMENT_METHOD_PLACEHOLDER' | translate),
            required: true,
            error: (touched() && paymentMethodId() == null) ? ('COST.REGLEMENT.ERR_PAYMENT_METHOD_REQUIRED' | translate) : undefined
          }"
          (selectedChange)="paymentMethodId.set($event[0] ? +$event[0] : null)" />

        <daf-multi-date-picker
          [config]="{ label: ('COST.REGLEMENT.DATE' | translate), required: true }"
          [value]="dateValue"
          (valueChange)="dateValue = $any($event)" />

        <daf-form-field
          [options]="{
            label: ('COST.REGLEMENT.COMMENT' | translate), type: 'textarea',
            placeholder: ('COST.REGLEMENT.COMMENT_PLACEHOLDER' | translate)
          }"
          [value]="comment()"
          (valueChange)="comment.set($any($event) ?? '')" />

        @if (serverError()) {
          <div class="rounded-lg bg-danger/10 px-3 py-2 text-body-sm text-danger">
            {{ serverError() }}
          </div>
        }

        <div class="flex justify-end gap-2.5 pt-1">
          <daf-button
            [label]="'COST.REGLEMENT.CANCEL' | translate"
            variant="secondary"
            [options]="{ disabled: saving() }"
            (onClick)="modalRef?.close()" />
          <daf-button
            [label]="(isEditMode() ? 'COST.REGLEMENT.SAVE' : 'COST.REGLEMENT.CREATE') | translate"
            variant="primary"
            [options]="{ loading: saving(), disabled: saving() }"
            (onClick)="confirm()" />
        </div>

      </div>
    </ng-template>
  `,
})
export class ReglementModalComponent {
  @ViewChild('tpl', { static: true }) private tpl!: TemplateRef<unknown>;

  private readonly svc      = inject(CostService);
  private readonly listSvc  = inject(FactListService);
  private readonly modal    = inject(ModalService);
  private readonly translate = inject(TranslateService);

  protected modalRef?: ModalRef;
  private onResolved?: () => void;

  protected data!: ReglementModalData;

  costInvoiceId         = signal<number | null>(null);
  /** true = the invoice is fixed (edit, or create for a known invoice): no picker. */
  fixedInvoice          = signal(false);
  invoiceReference      = signal<string | null>(null);
  supplierInvoiceNumber = signal<string | null>(null);
  expectedAmount        = signal<number | null>(null);
  currency              = signal<string | null>(null);
  montantPaye     = signal<number | null>(null);
  paymentMethodId = signal<number | null>(null);
  paymentMethodOptions = signal<SelectOption[]>([]);
  comment      = signal<string>('');
  saving       = signal(false);
  serverError  = signal<string | null>(null);
  touched      = signal(false);

  private dateIso = '';

  /** `daf-multi-date-picker` works in `Date`; the form stores the ISO (yyyy-MM-dd) the
   *  API expects — same pattern as expense-form.component.ts / employee-cost.component.ts. */
  get dateValue(): Date | null {
    if (!this.dateIso) return null;
    const d = new Date(this.dateIso);
    return isNaN(d.getTime()) ? null : d;
  }
  set dateValue(v: Date | Date[] | null) {
    const d = Array.isArray(v) ? v[0] : v;
    this.dateIso = d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '';
  }

  isEditMode(): boolean { return this.data.editing !== null; }

  readonly invoiceOptions = signal<SelectOption[]>([]);

  expectedAmountLabel(): string {
    const amount = this.expectedAmount();
    return amount == null ? '' : formatAmount(amount, this.currency() || 'EUR');
  }

  onInvoiceSelected(values: string[]): void {
    const id = Number(values[0]);
    this.costInvoiceId.set(values.length && Number.isFinite(id) ? id : null);
    this.applyInvoice(this.findPayable(this.costInvoiceId()));
  }

  open(data: ReglementModalData, onResolved: () => void): void {
    this.data = data;
    this.onResolved = onResolved;
    this.touched.set(false);
    this.saving.set(false);
    this.serverError.set(null);

    const payable = data.payableInvoices ?? [];
    this.invoiceOptions.set(payable.map(inv => ({
      value: String(inv.id),
      label: this.invoiceOptionLabel(inv),
    })));

    this.invoiceReference.set(data.invoiceReference ?? null);
    this.supplierInvoiceNumber.set(data.supplierInvoiceNumber ?? null);
    this.expectedAmount.set(data.expectedAmount ?? null);
    this.currency.set(data.currency ?? null);

    this.paymentMethodOptions.set([]);
    if (data.paysId != null) {
      this.listSvc.getListValues('PAYMENT_METHOD', data.paysId).subscribe(values => {
        this.paymentMethodOptions.set(values.map(v => ({
          value: String(v.id),
          label: this.translate.currentLang() === 'en' ? (v.labelEn || v.labelFr) : v.labelFr,
        })));
      });
    }

    if (data.editing) {
      this.fixedInvoice.set(true);
      this.costInvoiceId.set(data.editing.costInvoiceId);
      // Fill the header from the picker list when the caller passed the invoice there.
      const inv = this.findPayable(data.editing.costInvoiceId);
      if (inv) this.applyInvoice(inv, false);
      this.montantPaye.set(data.editing.montantPaye);
      this.paymentMethodId.set(data.editing.paymentMethodId);
      this.dateValue = new Date(data.editing.datePaiement);
      this.comment.set(data.editing.comment ?? '');
    } else {
      this.dateValue = new Date();
      this.comment.set('');
      this.paymentMethodId.set(null);
      if (data.costInvoiceId != null) {
        this.fixedInvoice.set(true);
        this.costInvoiceId.set(data.costInvoiceId);
        const inv = this.findPayable(data.costInvoiceId);
        if (inv) this.applyInvoice(inv, false);
        this.montantPaye.set(this.expectedAmount());
      } else {
        this.fixedInvoice.set(false);
        this.costInvoiceId.set(null);
        this.montantPaye.set(null);
        if (payable.length === 1) {
          this.costInvoiceId.set(payable[0].id);
          this.applyInvoice(payable[0]);
        }
      }
    }

    const t = (key: string) => this.translate.instant(key);
    this.modalRef = this.modal.open({
      title: t(this.isEditMode() ? 'COST.REGLEMENT.EDIT_TITLE' : 'COST.REGLEMENT.NEW_TITLE'),
      body:  this.tpl,
      size:  'md',
      closeOnBackdrop: false,
    });
  }

  get canSave(): boolean {
    return this.costInvoiceId() != null && (this.montantPaye() ?? 0) > 0 && !!this.dateIso
        && this.paymentMethodId() != null;
  }

  confirm(): void {
    this.touched.set(true);
    if (!this.canSave) return;
    this.saving.set(true);
    this.serverError.set(null);

    const body = {
      montantPaye:     this.montantPaye()!,
      datePaiement:    this.dateIso,
      paymentMethodId: this.paymentMethodId()!,
      comment:         this.comment().trim() || null,
    };

    const call$ = this.isEditMode()
      ? this.svc.updateReglement(this.data.editing!.id, body)
      : this.svc.createReglement(this.costInvoiceId()!, body);

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalRef?.close();
        this.onResolved?.();
      },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err.error?.detail ?? err.error?.message ?? err.error?.error
          ?? this.translate.instant('COST.REGLEMENT.GENERIC_ERROR'));
      },
    });
  }

  private findPayable(id: number | null): CostInvoiceDto | undefined {
    if (id == null) return undefined;
    return (this.data.payableInvoices ?? []).find(inv => inv.id === id);
  }

  /** Copies the invoice's display fields; `setAmount` also proposes its net to pay. */
  private applyInvoice(inv: CostInvoiceDto | undefined, setAmount = true): void {
    if (!inv) {
      if (setAmount) {
        this.expectedAmount.set(null);
        this.montantPaye.set(null);
      }
      return;
    }
    this.invoiceReference.set(inv.reference ?? null);
    this.supplierInvoiceNumber.set(inv.supplierInvoiceNumber ?? null);
    this.currency.set(inv.currency ?? null);
    this.expectedAmount.set(inv.netToPay ?? null);
    if (setAmount) this.montantPaye.set(inv.netToPay ?? null);
  }

  private invoiceOptionLabel(inv: CostInvoiceDto): string {
    const ref = inv.reference || ('#' + inv.id);
    const supplierNo = inv.supplierInvoiceNumber ? ' (' + inv.supplierInvoiceNumber + ')' : '';
    return ref + supplierNo + ' — ' + formatAmount(inv.netToPay, inv.currency || 'EUR');
  }
}
