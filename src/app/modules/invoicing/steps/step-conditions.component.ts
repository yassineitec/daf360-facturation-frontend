import { Component, inject, input, output } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { CONDITIONS_PAIEMENT } from '../invoice.model';
import { StepAffaireValue } from './step-affaire.component';
import { StepLinesValue } from './step-lines.component';

export interface StepConditionsValue {
  dateEcheance:      string;
  conditionsPaiement: string;
  bonDeCommande:     string | null;
  notes:             string | null;
}

@Component({
  selector: 'app-step-conditions',
  imports: [ReactiveFormsModule],
  template: `
<div class="step-conditions">

  <div class="form-grid">
    <div class="field">
      <label for="sc-echeance">Date d'échéance *</label>
      <input id="sc-echeance" type="date" formControlName="dateEcheance" [formControl]="form.controls['dateEcheance']"
        class="form-input"
        [class.invalid]="form.controls['dateEcheance'].invalid && form.controls['dateEcheance'].touched" />
      @if (form.controls['dateEcheance'].invalid && form.controls['dateEcheance'].touched) {
        <span class="error-msg">Date requise.</span>
      }
    </div>

    <div class="field">
      <label for="sc-cond">Conditions de paiement *</label>
      <select id="sc-cond" class="form-input" [formControl]="form.controls['conditionsPaiement']"
        [class.invalid]="form.controls['conditionsPaiement'].invalid && form.controls['conditionsPaiement'].touched">
        <option value="">Sélectionner…</option>
        @for (opt of conditionOptions; track opt.value) {
          <option [value]="opt.value">{{ opt.label }}</option>
        }
      </select>
      @if (form.controls['conditionsPaiement'].invalid && form.controls['conditionsPaiement'].touched) {
        <span class="error-msg">Conditions requises.</span>
      }
    </div>

    <div class="field field--full">
      <label for="sc-bdc">
        Bon de commande
        @if (isForfaitOrLumpSum()) { <span class="required-mark">* requis pour Forfait/Lump Sum</span> }
      </label>
      <input id="sc-bdc" type="text" class="form-input" [formControl]="form.controls['bonDeCommande']"
        maxlength="100" placeholder="N° bon de commande"
        [class.invalid]="form.controls['bonDeCommande'].invalid && form.controls['bonDeCommande'].touched" />
      @if (form.controls['bonDeCommande'].invalid && form.controls['bonDeCommande'].touched) {
        <span class="error-msg">BDC requis pour ce type de facturation.</span>
      }
    </div>

    <div class="field field--full">
      <label for="sc-notes">Notes internes</label>
      <textarea id="sc-notes" class="form-input" [formControl]="form.controls['notes']"
        rows="3" maxlength="1000" placeholder="Notes visibles uniquement en interne…"></textarea>
    </div>
  </div>

  <div class="step-actions">
    <button type="button" class="btn-back" (click)="prevStep.emit()">← Retour</button>
    <button type="button" class="btn-next" (click)="next()">Suivant →</button>
  </div>
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepConditionsComponent {
  private readonly fb = inject(FormBuilder);

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
    dateEcheance:      ['', Validators.required],
    conditionsPaiement:['', Validators.required],
    bonDeCommande:     [''],
    notes:             [''],
  });

  next(): void {
    // Dynamically require bonDeCommande for FINALE/INTERMEDIAIRE
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
      dateEcheance:      v.dateEcheance!,
      conditionsPaiement:v.conditionsPaiement!,
      bonDeCommande:     v.bonDeCommande?.trim() || null,
      notes:             v.notes?.trim() || null,
    });
  }
}
