import {
  Component, TemplateRef, ViewChild, inject, signal,
} from '@angular/core';
import { TranslateService, TranslatePipe } from '@ngx-translate/core';
import {
  ButtonComponent, FormFieldComponent, ModalRef, ModalService,
  MultiDatePickerComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { CostLineDto, CostLineReglementDto } from '../cost.model';
import { CostService } from '../cost.service';

export interface ReglementModalData {
  /** null when creating a NEW règlement (the line picker is shown); set when editing
   *  an existing one (the line picker is hidden -- it's fixed to this one). */
  editing: CostLineReglementDto | null;
  /** Only used in create mode: that supplier's payable (APPROVED, no existing
   *  règlement) cost lines to choose from. */
  payableLines: CostLineDto[];
}

/**
 * Owns one `ModalService`-backed dialog, reused by both call sites (`cost-lines` and
 * `cost-line-detail`) — mount once per caller (`<app-reglement-modal #reglementModal />`,
 * unconditionally, no `@if`) and call `.open(data, onResolved)`. Replaces the previous
 * hand-rolled backdrop/box/header/footer component: the `<ng-template>` here is only ever
 * rendered inside the library's own dialog chrome, never on its own.
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

        @if (isEditMode()) {
          <div class="flex flex-col gap-1 rounded-xl bg-surface-container p-3">
            <span class="text-label-caps font-extrabold uppercase tracking-widest text-on-surface-variant">
              {{ 'COST.REGLEMENT.LINE' | translate }}
            </span>
            <span class="text-body-md font-bold text-on-surface">
              {{ 'COST.REGLEMENT.LINE_NUMBER' | translate:{ id: data.editing!.costLineId } }}
            </span>
          </div>
        } @else {
          <daf-select
            [options]="lineOptions()"
            [selected]="costLineId() != null ? [costLineId()!.toString()] : []"
            [config]="{
              label: ('COST.REGLEMENT.LINE_PICKER' | translate),
              placeholder: ('COST.REGLEMENT.LINE_PICKER_PLACEHOLDER' | translate),
              required: true,
              searchable: true,
              error: (touched() && costLineId() == null) ? ('COST.REGLEMENT.ERR_LINE_REQUIRED' | translate) : undefined
            }"
            (selectedChange)="onLineSelected($event)" />
        }

        <daf-form-field
          [options]="{
            label: ('COST.REGLEMENT.AMOUNT' | translate), type: 'number', required: true,
            error: (touched() && !(montantPaye()! > 0)) ? ('COST.REGLEMENT.ERR_AMOUNT_REQUIRED' | translate) : undefined
          }"
          [value]="montantPaye()"
          (valueChange)="montantPaye.set($any($event))" />

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
  private readonly modal    = inject(ModalService);
  private readonly translate = inject(TranslateService);

  protected modalRef?: ModalRef;
  private onResolved?: () => void;

  protected data!: ReglementModalData;

  costLineId   = signal<number | null>(null);
  montantPaye  = signal<number | null>(null);
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

  readonly lineOptions = signal<SelectOption[]>([]);

  onLineSelected(values: string[]): void {
    const id = Number(values[0]);
    this.costLineId.set(Number.isFinite(id) ? id : null);
    const line = this.data.payableLines.find(l => l.id === this.costLineId());
    this.montantPaye.set(line?.grossAmountLocal ?? null);
  }

  open(data: ReglementModalData, onResolved: () => void): void {
    this.data = data;
    this.onResolved = onResolved;
    this.touched.set(false);
    this.saving.set(false);
    this.serverError.set(null);
    this.lineOptions.set(data.payableLines.map(l => ({
      value: String(l.id),
      label: `${l.reference ?? ('#' + l.id)} — ${l.label ?? ''}`,
    })));

    if (data.editing) {
      this.costLineId.set(data.editing.costLineId);
      this.montantPaye.set(data.editing.montantPaye);
      this.dateValue = new Date(data.editing.datePaiement);
      this.comment.set(data.editing.comment ?? '');
    } else {
      this.costLineId.set(null);
      this.montantPaye.set(null);
      this.dateValue = new Date();
      this.comment.set('');
      if (data.payableLines.length === 1) {
        const line = data.payableLines[0];
        this.costLineId.set(line.id);
        this.montantPaye.set(line.grossAmountLocal ?? null);
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
    return this.costLineId() != null && (this.montantPaye() ?? 0) > 0 && !!this.dateIso;
  }

  confirm(): void {
    this.touched.set(true);
    if (!this.canSave) return;
    this.saving.set(true);
    this.serverError.set(null);

    const body = {
      montantPaye:  this.montantPaye()!,
      datePaiement: this.dateIso,
      comment:      this.comment().trim() || null,
    };

    const call$ = this.isEditMode()
      ? this.svc.updateReglement(this.data.editing!.id, body)
      : this.svc.createReglement(this.costLineId()!, body);

    call$.subscribe({
      next: () => {
        this.saving.set(false);
        this.modalRef?.close();
        this.onResolved?.();
      },
      error: err => {
        this.saving.set(false);
        this.serverError.set(err.error?.message ?? err.error?.error
          ?? this.translate.instant('COST.REGLEMENT.GENERIC_ERROR'));
      },
    });
  }
}
