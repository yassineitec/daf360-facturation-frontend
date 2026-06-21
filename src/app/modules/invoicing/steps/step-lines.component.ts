import { Component, inject, input, output } from '@angular/core';
import {
  ReactiveFormsModule, FormBuilder, FormArray, FormGroup, Validators,
} from '@angular/forms';
import { TVA_RATES } from '../invoice.model';
import { StepAffaireValue } from './step-affaire.component';

export interface StepLinesValue {
  lines: { description: string; quantity: number; unitRate: number; vatRatePct: number }[];
}

@Component({
  selector: 'app-step-lines',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
<div class="step-lines">

  <div class="lines-header">
    <span class="section-title">Lignes de facturation</span>
    <button type="button" class="btn-add-line" (click)="addLine()">+ Ajouter une ligne</button>
  </div>

  <div class="lines-table-wrap">
    <table class="lines-table">
      <thead>
        <tr>
          <th class="col-desc">Description *</th>
          <th class="col-num">Qté *</th>
          <th class="col-num">PU HT *</th>
          <th class="col-num">TVA</th>
          <th class="col-num">Total HT</th>
          <th class="col-num">Total TTC</th>
          <th class="col-action"></th>
        </tr>
      </thead>
      <tbody [formGroup]="form">
        <ng-container formArrayName="lines">
          @for (lg of linesArray.controls; track $index; let i = $index) {
            <tr [formGroupName]="i" class="line-row">
              <td>
                <input type="text" formControlName="description" class="td-input"
                  [class.invalid]="lg.get('description')!.invalid && lg.get('description')!.touched"
                  maxlength="255" placeholder="Description de la prestation" />
              </td>
              <td>
                <input type="number" formControlName="quantite" class="td-input td-num"
                  min="0.01" step="0.01" (input)="recalc(i)" />
              </td>
              <td>
                <input type="number" formControlName="prixUnitaireHt" class="td-input td-num"
                  min="0" step="0.01" (input)="recalc(i)" />
              </td>
              <td>
                <select formControlName="tauxTva" class="td-input td-num" (change)="recalc(i)">
                  @for (r of tvaRates; track r) {
                    <option [value]="r">{{ r }}%</option>
                  }
                </select>
              </td>
              <td class="td-computed">{{ formatAmount(lineHt(i)) }}</td>
              <td class="td-computed">{{ formatAmount(lineTtc(i)) }}</td>
              <td>
                <button type="button" class="remove-line-btn" title="Supprimer" (click)="removeLine(i)"
                  [disabled]="linesArray.length === 1">✕</button>
              </td>
            </tr>
          }
        </ng-container>
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4" class="totals-label">Totaux</td>
          <td class="total-ht">{{ formatAmount(totalHt) }}</td>
          <td class="total-ttc">{{ formatAmount(totalTtc) }}</td>
          <td></td>
        </tr>
      </tfoot>
    </table>
  </div>

  @if (form.invalid && form.touched) {
    <div class="form-error">Toutes les lignes doivent être remplies correctement.</div>
  }

  <div class="step-actions">
    <button type="button" class="btn-back" (click)="prevStep.emit()">
      <span class="material-symbols-outlined">arrow_back</span>
      Retour
    </button>
    <button type="button" class="btn-next" (click)="next()" [disabled]="linesArray.length === 0">
      Suivant
      <span class="material-symbols-outlined">arrow_forward</span>
    </button>
  </div>
</div>
  `,
  styleUrl: './step.component.scss',
})
export class StepLinesComponent {
  private readonly fb = inject(FormBuilder);

  affaireData = input.required<StepAffaireValue>();
  prevStep    = output<void>();
  nextStep    = output<StepLinesValue>();

  readonly tvaRates = TVA_RATES;

  form = this.fb.group({
    lines: this.fb.array([this.newLine()]),
  });

  get linesArray(): FormArray { return this.form.get('lines') as FormArray; }

  newLine(): FormGroup {
    return this.fb.group({
      description:    ['', Validators.required],
      quantite:       [1, [Validators.required, Validators.min(0.01)]],
      prixUnitaireHt: [0, [Validators.required, Validators.min(0)]],
      tauxTva:        [19],
    });
  }

  addLine():    void { this.linesArray.push(this.newLine()); }
  removeLine(i: number): void {
    if (this.linesArray.length > 1) this.linesArray.removeAt(i);
  }

  recalc(_i: number): void { /* Angular tracks via FormControl values */ }

  lineHt(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return (g.value.quantite ?? 0) * (g.value.prixUnitaireHt ?? 0);
  }

  lineTtc(i: number): number {
    const g = this.linesArray.at(i) as FormGroup;
    return this.lineHt(i) * (1 + (g.value.tauxTva ?? 0) / 100);
  }

  get totalHt():  number { return this.linesArray.controls.reduce((s, _, i) => s + this.lineHt(i), 0); }
  get totalTtc(): number { return this.linesArray.controls.reduce((s, _, i) => s + this.lineTtc(i), 0); }

  next(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) return;
    this.nextStep.emit({
      lines: this.linesArray.value.map((l: { description: string; quantite: number; prixUnitaireHt: number; tauxTva: number }) => ({
        description: l.description,
        quantity:    l.quantite,
        unitRate:    l.prixUnitaireHt,
        vatRatePct:  l.tauxTva,
      })),
    });
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: 'TND', minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(v);
  }
}
