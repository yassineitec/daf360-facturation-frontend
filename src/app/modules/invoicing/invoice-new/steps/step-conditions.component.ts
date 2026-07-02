import { Component, inject, input, output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
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
  imports: [ReactiveFormsModule, TranslatePipe],
  template: `
<div class="step-conditions">

  <div class="form-grid">
    <div class="field">
      <label for="sc-echeance">{{ 'INVOICING.STEP_CONDITIONS.DUE_DATE_LABEL' | translate }}</label>
      <input id="sc-echeance" type="date" [formControl]="form.controls['dateEcheance']"
        class="form-input"
        [class.invalid]="form.controls['dateEcheance'].invalid && form.controls['dateEcheance'].touched" />
      @if (form.controls['dateEcheance'].invalid && form.controls['dateEcheance'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_CONDITIONS.DUE_DATE_REQUIRED' | translate }}</span>
      }
    </div>

    <div class="field">
      <label for="sc-cond">{{ 'INVOICING.STEP_CONDITIONS.CONDITIONS_LABEL' | translate }}</label>
      <div class="form-select-wrap">
        <select id="sc-cond" class="form-input" [formControl]="form.controls['conditionsPaiement']"
          [class.invalid]="form.controls['conditionsPaiement'].invalid && form.controls['conditionsPaiement'].touched">
          <option value="">{{ 'INVOICING.STEP_CONDITIONS.CONDITIONS_SELECT' | translate }}</option>
          @for (opt of conditionOptions; track opt.value) {
            <option [value]="opt.value">{{ opt.label | translate }}</option>
          }
        </select>
      </div>
      @if (form.controls['conditionsPaiement'].invalid && form.controls['conditionsPaiement'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_CONDITIONS.CONDITIONS_REQUIRED' | translate }}</span>
      }
    </div>

    <div class="field field--full">
      <label for="sc-bdc">
        {{ 'INVOICING.STEP_CONDITIONS.BDC_LABEL' | translate }}
        @if (isForfaitOrLumpSum()) {
          <span class="required-mark">{{ 'INVOICING.STEP_CONDITIONS.BDC_REQUIRED_MARK' | translate }}</span>
        }
      </label>
      <input id="sc-bdc" type="text" class="form-input" [formControl]="form.controls['bonDeCommande']"
        maxlength="100"
        [placeholder]="'INVOICING.STEP_CONDITIONS.BDC_PLACEHOLDER' | translate"
        [class.invalid]="form.controls['bonDeCommande'].invalid && form.controls['bonDeCommande'].touched" />
      @if (form.controls['bonDeCommande'].invalid && form.controls['bonDeCommande'].touched) {
        <span class="error-msg">{{ 'INVOICING.STEP_CONDITIONS.BDC_REQUIRED_ERROR' | translate }}</span>
      }
    </div>

    <div class="field field--full">
      <label for="sc-notes">{{ 'INVOICING.STEP_CONDITIONS.NOTES_LABEL' | translate }}</label>
      <textarea id="sc-notes" class="form-input" [formControl]="form.controls['notes']"
        rows="3" maxlength="1000"
        [placeholder]="'INVOICING.STEP_CONDITIONS.NOTES_PLACEHOLDER' | translate"></textarea>
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
  private readonly fb = inject(FormBuilder);

  showActions = input<boolean>(true);
  affaireData = input.required<StepAffaireValue>();
  linesData   = input.required<StepLinesValue>();
  prevStep    = output<void>();
  nextStep    = output<StepConditionsValue>();

  readonly conditionOptions = Object.entries(CONDITIONS_PAIEMENT)
    .map(([value, label]) => ({ value, label }));

  readonly isForfaitOrLumpSum = () => {
    const t = this.affaireData().invoiceType;
    return t === 'FINALE' || t === 'INTERMEDIAIRE';
  };

  form = this.fb.group({
    dateEcheance:       ['', Validators.required],
    conditionsPaiement: ['', Validators.required],
    bonDeCommande:      [''],
    notes:              [''],
  });

  next(): void {
    const bdcCtrl = this.form.controls['bonDeCommande'];
    if (this.isForfaitOrLumpSum()) {
      bdcCtrl.setValidators([Validators.required]);
    } else {
      bdcCtrl.clearValidators();
    }
    bdcCtrl.updateValueAndValidity();

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
