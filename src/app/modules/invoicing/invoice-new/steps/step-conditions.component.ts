import { Component, computed, effect, inject, input, output } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { startWith } from 'rxjs';
import {
  FormFieldComponent, MultiDatePickerComponent, SelectComponent, SelectOption,
} from '@khalilrebhiitec/daf360';
import { CONDITIONS_PAIEMENT } from '../../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { StepLinesValue } from './step-lines.component';

export interface StepConditionsValue {
  dateEcheance:       string;
  conditionsPaiement: string;
  bonDeCommande:      string | null;
  notes:              string | null;
}

@Component({
  selector: 'app-step-conditions',
  standalone: true,
  imports: [ReactiveFormsModule, TranslatePipe, FormFieldComponent, SelectComponent, MultiDatePickerComponent],
  template: `
<div class="step-conditions">

  <div class="form-grid">
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
        (selectedChange)="setText('conditionsPaiement', $event[0])" />
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
        });
      }
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
    });
  }
}
