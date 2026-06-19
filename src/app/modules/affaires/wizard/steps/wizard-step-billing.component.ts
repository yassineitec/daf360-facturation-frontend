import { Component, Input, Output, EventEmitter } from '@angular/core';

import { AffaireDraftState } from '../../affaire-wizard.model';
import { WizardStepAvComponent }  from './wizard-step-av.component';
import { WizardStepJalComponent } from './wizard-step-jal.component';
import { WizardStepTmComponent }  from './wizard-step-tm.component';
import { WizardStepCpComponent }  from './wizard-step-cp.component';
import { WizardStepRmbComponent } from './wizard-step-rmb.component';

@Component({
  selector: 'app-wizard-step-billing',
  standalone: true,
  imports: [
    WizardStepAvComponent, WizardStepJalComponent,
    WizardStepTmComponent, WizardStepCpComponent, WizardStepRmbComponent,
  ],
  templateUrl: './wizard-step-billing.component.html',
  styleUrl: './wizard-step-billing.component.scss',
})
export class WizardStepBillingComponent {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  onSubDraftChange(updated: AffaireDraftState): void {
    this.draftChange.emit(updated);
  }
}
