import { Component, Input, Output, EventEmitter, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';

import { ButtonComponent } from '@khalilrebhiitec/daf360';

import { AffaireDraftState } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-jal',
  standalone: true,
  imports: [FormsModule, DecimalPipe, ButtonComponent],
  templateUrl: './wizard-step-jal.component.html',
  styleUrl: './wizard-step-jal.component.scss',
})
export class WizardStepJalComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
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

  isBalanced(): boolean {
    const budget = this.draft.budgetPrevisionnel ?? 0;
    if (!budget) return false;
    return Math.abs(this.draft.jalonTotal - budget) < 0.001;
  }

  private emit(): void {
    this.draftChange.emit({ ...this.draft, jalons: [...this.draft.jalons] });
  }
}
