import { Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { startWith } from 'rxjs';
import {
  FormFieldComponent, MultiDatePickerComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { CONDITIONS_PAIEMENT, CONDITIONS_PAIEMENT_DAYS } from '../../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { StepLinesValue } from './step-lines.component';

export interface StepConditionsValue {
  dateEcheance:       string;
  conditionsPaiement: string;
  bonDeCommande:      string | null;
  notes:              string | null;
  /** Only ever set/shown in amend mode — correcting the emission date of an already-
   *  emitted invoice. Empty string outside amend mode (createDraft/updateDraft ignore it). */
  dateEmission:       string;
  /** Only ever set/shown in amend mode — overriding an already-emitted invoice's number.
   *  Empty string outside amend mode (createDraft/updateDraft ignore it). */
  invoiceNumber:      string;
}

@Component({
  selector: 'app-step-conditions',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, FormFieldComponent, SelectComponent, MultiDatePickerComponent],
  template: `
<div class="step-conditions">

  <div class="form-grid">
    @if (amendMode()) {
      <div class="field">
        <daf-multi-date-picker
          [config]="{
            label: ('INVOICING.STEP_CONDITIONS.ISSUE_DATE_LABEL' | translate),
            selectionMode: 'single'
          }"
          [value]="dateEmission()"
          (valueChange)="setDateEmission($event)" />
      </div>
      <div class="field">
        <daf-form-field
          [options]="{
            label: ('INVOICING.STEP_CONDITIONS.INVOICE_NUMBER_LABEL' | translate),
            placeholder: ('INVOICING.STEP_CONDITIONS.INVOICE_NUMBER_PLACEHOLDER' | translate),
            maxLength: 100,
            error: form.controls['invoiceNumber'].invalid && form.controls['invoiceNumber'].touched
              ? ('INVOICING.STEP_CONDITIONS.INVOICE_NUMBER_REQUIRED' | translate) : undefined
          }"
          [value]="form.controls['invoiceNumber'].value"
          (valueChange)="setText('invoiceNumber', $event)" />
      </div>
    }

    <div class="field">
      <daf-multi-date-picker
        [config]="{
          label: ('INVOICING.STEP_CONDITIONS.DUE_DATE_LABEL' | translate),
          selectionMode: 'single',
          error: form.controls['dateEcheance'].invalid && form.controls['dateEcheance'].touched
            ? ('INVOICING.STEP_CONDITIONS.DUE_DATE_REQUIRED' | translate) : undefined
        }"
        [value]="dueDate()"
        (valueChange)="setDueDate($event)" />
      @if (conditionOffsetDays() !== null) {
        <p class="search-hint">{{ 'INVOICING.STEP_CONDITIONS.DUE_DATE_AUTO_HINT' | translate }}</p>
      }
    </div>

    <div class="field">
      <daf-select
        [options]="conditionSelectOptions()"
        [selected]="form.controls['conditionsPaiement'].value ? [form.controls['conditionsPaiement'].value] : []"
        [config]="{
          label: ('INVOICING.STEP_CONDITIONS.CONDITIONS_LABEL' | translate),
          placeholder: ('INVOICING.STEP_CONDITIONS.CONDITIONS_SELECT' | translate),
          error: form.controls['conditionsPaiement'].invalid && form.controls['conditionsPaiement'].touched
            ? ('INVOICING.STEP_CONDITIONS.CONDITIONS_REQUIRED' | translate) : undefined
        }"
        (selectedChange)="onConditionsPaiementChange($event[0])" />
    </div>

    <div class="field field--full">
      <daf-form-field
        [options]="{
          label: ('INVOICING.STEP_CONDITIONS.BDC_LABEL' | translate),
          placeholder: ('INVOICING.STEP_CONDITIONS.BDC_PLACEHOLDER' | translate),
          maxLength: 100
        }"
        [value]="form.controls['bonDeCommande'].value"
        (valueChange)="setText('bonDeCommande', $event)" />
    </div>

    <div class="field field--full">
      <daf-form-field
        [options]="{
          label: ('INVOICING.STEP_CONDITIONS.NOTES_LABEL' | translate),
          placeholder: ('INVOICING.STEP_CONDITIONS.NOTES_PLACEHOLDER' | translate),
          type: 'textarea', rows: 3, maxLength: 1000
        }"
        [value]="form.controls['notes'].value"
        (valueChange)="setText('notes', $event)" />
    </div>
  </div>

  @if (showActions()) {
    <div class="step-actions">
      <button type="button" class="btn-back" (click)="prevStep.emit()">
        <span class="material-symbols-outlined">arrow_back</span>
        {{ 'INVOICING.STEP_CONDITIONS.BACK' | translate }}
      </button>
      <button type="button" class="btn-next" (click)="next()">
        {{ 'INVOICING.STEP_CONDITIONS.NEXT' | translate }}
        <span class="material-symbols-outlined">arrow_forward</span>
      </button>
    </div>
  }
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepConditionsComponent {
  private readonly fb        = inject(FormBuilder);
  private readonly translate = inject(TranslateService);

  showActions  = input<boolean>(true);
  affaireData  = input.required<StepAffaireValue>();
  linesData    = input.required<StepLinesValue>();
  /** Set when editing an existing draft — pre-fills the form with its saved values. */
  initialValue = input<StepConditionsValue | null>(null);
  /** True when correcting an already-EMITTED/SENT invoice — the only case where the
   *  emission date itself is shown and editable, next to the due date. */
  amendMode    = input<boolean>(false);
  prevStep     = output<void>();
  nextStep     = output<StepConditionsValue>();

  readonly conditionOptions = Object.entries(CONDITIONS_PAIEMENT)
    .map(([value, label]) => ({ value, label }));

  /** Options du daf-select — libellés traduits, et retraduits à chaque changement de langue. */
  private readonly lang = toSignal(this.translate.onLangChange);
  readonly conditionSelectOptions = computed<SelectOption[]>(() => {
    this.lang();
    return this.conditionOptions.map(o => ({ value: o.value, label: this.translate.instant(o.label) }));
  });

  setDueDate(v: Date | Date[] | null): void {
    const d = Array.isArray(v) ? v[0] : v;
    this.setText('dateEcheance', d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '');
  }

  setDateEmission(v: Date | Date[] | null): void {
    const d = Array.isArray(v) ? v[0] : v;
    this.setText('dateEmission', d
      ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      : '');
    // Amend mode's emission-date correction is one of the two inputs the due date is
    // derived from (the other being the condition itself, see recalcDueDate()) — recompute
    // whenever it changes, same "condition is always the source of truth" rule.
    this.recalcDueDate();
  }

  onConditionsPaiementChange(value: string): void {
    this.setText('conditionsPaiement', value);
    this.recalcDueDate();
  }

  /** Offset (days) for the currently-selected condition, or null if none/unrecognized —
   * drives both the calculation itself and whether the "auto-calculated" hint is shown. */
  readonly conditionOffsetDays = computed<number | null>(() => {
    const code = this.conditionCode();
    return code && code in CONDITIONS_PAIEMENT_DAYS ? CONDITIONS_PAIEMENT_DAYS[code] : null;
  });

  /** Auto-fills "Date d'échéance" from the condition's offset, anchored on today's date
   * while still a DRAFT (no fixed emission date exists yet) or on the entered/corrected
   * emission date in amend mode. Still a plain editable field afterward — this only ever
   * runs in response to the user picking a condition or (amend mode) changing the emission
   * date, never on initial load, so it can't clobber an already-saved due date when editing
   * an existing draft/invoice. */
  private recalcDueDate(): void {
    const offset = this.conditionOffsetDays();
    if (offset === null) return;
    const anchor = this.amendMode() ? this.dateEmission() : new Date();
    if (!anchor) return;
    const due = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + offset);
    this.setText('dateEcheance',
      `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}`);
  }

  /** Pont daf-form-field / daf-select → FormControl (ni l'un ni l'autre n'est un ControlValueAccessor). */
  setText(key: keyof typeof this.form.controls, v: string | number | null | undefined): void {
    const c = this.form.controls[key];
    c.setValue(v == null ? '' : String(v));
    c.markAsTouched();
  }

  form = this.fb.group({
    dateEcheance:       ['', Validators.required],
    conditionsPaiement: ['', Validators.required],
    // Bon de commande : toujours facultatif, quel que soit le type de facture — plus
    // de Validators.required conditionnel pour Forfait/Lump Sum (FINALE/INTERMEDIAIRE).
    bonDeCommande:      [''],
    notes:              [''],
    // Amend mode only — never required, a correction is optional, not a mandatory re-entry.
    dateEmission:       [''],
    // Amend mode only — unlike dateEmission, a blank invoice number isn't valid once shown:
    // you can't save a legal document with no number. Validators.required is toggled on/off
    // by the effect() in the constructor below, since amendMode() isn't known until the
    // parent sets it (same signal-input timing issue documented on that effect already).
    invoiceNumber:      [''],
  });

  /**
   * daf-multi-date-picker travaille en `Date`, le formulaire (et l'API) en yyyy-MM-dd.
   * Signal plutôt que méthode : un `new Date()` à chaque passage de détection casserait
   * l'identité de l'input (ExpressionChanged en dev). Lu en date LOCALE — `new Date(iso)`
   * serait minuit UTC, donc la veille à l'affichage sur un fuseau à l'ouest d'UTC.
   * Déclaré APRÈS `form` : les initialiseurs de champs s'exécutent dans l'ordre.
   */
  private readonly dueIso = toSignal(
    this.form.controls.dateEcheance.valueChanges.pipe(startWith(this.form.controls.dateEcheance.value)),
  );
  readonly dueDate = computed<Date | null>(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(this.dueIso() ?? '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  });

  private readonly emissionIso = toSignal(
    this.form.controls.dateEmission.valueChanges.pipe(startWith(this.form.controls.dateEmission.value)),
  );
  readonly dateEmission = computed<Date | null>(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(this.emissionIso() ?? '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  });

  private readonly conditionCode = toSignal(
    this.form.controls.conditionsPaiement.valueChanges.pipe(startWith(this.form.controls.conditionsPaiement.value)),
  );

  constructor() {
    // Signal inputs are only bound by Angular AFTER the constructor runs — reading
    // initialValue() directly here always saw its default (null), never the real
    // edit-mode data passed down by the parent, so this step silently never pre-filled
    // when editing an existing draft (same bug found and fixed in StepLinesComponent's
    // seedFromInitialLines — 2026-08-28).
    let seeded = false;
    effect(() => {
      const iv = this.initialValue();
      if (iv && !seeded) {
        seeded = true;
        this.form.patchValue({
          dateEcheance:       iv.dateEcheance,
          conditionsPaiement: iv.conditionsPaiement,
          bonDeCommande:      iv.bonDeCommande ?? '',
          notes:              iv.notes ?? '',
          dateEmission:       iv.dateEmission ?? '',
          invoiceNumber:      iv.invoiceNumber ?? '',
        });
      }
    });

    // Required only in amend mode — a DRAFT has no number to correct, so the field isn't
    // even shown outside amend mode (see the template's @if (amendMode()) block above).
    effect(() => {
      const control = this.form.controls.invoiceNumber;
      control.setValidators(this.amendMode() ? [Validators.required] : []);
      control.updateValueAndValidity({ emitEvent: false });
    });
  }

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.nextStep.emit({
      dateEcheance:       v.dateEcheance!,
      conditionsPaiement: v.conditionsPaiement!,
      bonDeCommande:      v.bonDeCommande?.trim() || null,
      notes:              v.notes?.trim()         || null,
      dateEmission:       v.dateEmission ?? '',
      invoiceNumber:      v.invoiceNumber ?? '',
    });
  }
}
