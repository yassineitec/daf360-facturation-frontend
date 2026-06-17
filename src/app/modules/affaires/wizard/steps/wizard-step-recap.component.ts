import { Component, Input } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';

import { AffaireDraftState, BILLING_MODES } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-recap',
  standalone: true,
  imports: [DecimalPipe, DatePipe],
  templateUrl: './wizard-step-recap.component.html',
  styleUrl: './wizard-step-recap.component.scss',
})
export class WizardStepRecapComponent {
  @Input() draft!: AffaireDraftState;
  @Input() draftId!: number | null;

  getModeOption() { return BILLING_MODES.find(m => m.code === this.draft.billingMode); }
  getModeLabelFr() { return this.getModeOption()?.labelFr ?? this.draft.billingMode ?? '—'; }
  getModeIcon()   { return this.getModeOption()?.icon ?? 'receipt'; }
}
