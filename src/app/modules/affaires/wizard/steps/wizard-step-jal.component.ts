import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';

import { ButtonComponent, FormFieldComponent } from '@khalilrebhiitec/daf360';

import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-jal',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonComponent, FormFieldComponent, TranslatePipe],
  templateUrl: './wizard-step-jal.component.html',
  styleUrl: './wizard-step-jal.component.scss',
})
export class WizardStepJalComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  ngOnInit(): void {
    if (!this.draft.jalons.length) this.addJalon();
    else this.updateJalonTotal();
  }

  addJalon(): void {
    const nextOrdre = this.draft.jalons.length + 1;
    this.draft.jalons = [...this.draft.jalons, { label: '', montant: 0, ordre: nextOrdre }];
    this.updateJalonTotal();
  }

  removeJalon(index: number): void {
    this.draft.jalons = this.draft.jalons
      .filter((_, i) => i !== index)
      .map((j, i) => ({ ...j, ordre: i + 1 }));
    this.updateJalonTotal();
  }

  updateJalonTotal(): void {
    this.draft.jalonTotal = Math.round(
      this.draft.jalons.reduce((sum, j) => sum + (Number(j.montant) || 0), 0) * 1000,
    ) / 1000;
    this.emit();
  }

  // daf-form-field emits string | number | null; keep the model types then recompute + emit.
  onLabelChange(j: AffaireDraftState['jalons'][0], v: string | number | null): void {
    j.label = v == null ? '' : String(v);
    this.updateJalonTotal();
  }

  onMontantChange(j: AffaireDraftState['jalons'][0], v: string | number | null): void {
    j.montant = v === null || v === '' ? 0 : Number(v);
    this.updateJalonTotal();
  }

  onDateChange(j: AffaireDraftState['jalons'][0], v: string | number | null): void {
    j.datePrevisionnelle = v == null || v === '' ? undefined : String(v);
    this.updateJalonTotal();
  }

  onDescriptionChange(j: AffaireDraftState['jalons'][0], v: string | number | null): void {
    j.description = v == null || v === '' ? undefined : String(v);
    this.updateJalonTotal();
  }

  isBalanced(): boolean {
    const budget = this.draft.budgetPrevisionnel ?? 0;
    if (!budget) return false;
    return Math.abs(this.draft.jalonTotal - budget) < 0.001;
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, jalons: [...this.draft.jalons] });
  }
}
