import { Component, Input, Output, EventEmitter } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

import { AffaireDraftState } from '../../affaire-wizard.model';
import { WizardStepAvComponent }       from './wizard-step-av.component';
import { WizardStepTmComponent }       from './wizard-step-tm.component';
import { WizardStepCpComponent }       from './wizard-step-cp.component';
import { WizardStepRmbComponent }      from './wizard-step-rmb.component';
import { WizardStepLivrableComponent } from './wizard-step-livrable.component';

/** Modes ayant un libellé métier sous `AFFAIRES.wizard.billing.mode_config`. */
const LABELLED_MODES = new Set<string>(['AV', 'TM', 'CP', 'RMB', 'LIVRABLE']);

@Component({
  selector: 'app-wizard-step-billing',
  standalone: true,
  imports: [
    TranslatePipe,
    WizardStepAvComponent,
    WizardStepTmComponent, WizardStepCpComponent, WizardStepRmbComponent,
    WizardStepLivrableComponent,
  ],
  templateUrl: './wizard-step-billing.component.html',
  styleUrl: './wizard-step-billing.component.scss',
})
export class WizardStepBillingComponent {
  @Input() draft!: AffaireDraftState;
  @Input() locked = false;
  @Output() draftChange = new EventEmitter<AffaireDraftState>();

  /**
   * Clé du libellé métier du mode courant. Un mode inconnu retombe sur le code brut plutôt
   * que d'afficher une clé de traduction non résolue au milieu du titre.
   */
  modeConfigKey(): string {
    const mode = this.draft?.billingMode;
    if (!mode) return '';
    // Le pipe `translate` rend la CLÉ telle quelle quand elle est absente : sans ce
    // filtre, un mode inédit afficherait « AFFAIRES.wizard.billing.mode_config.XYZ »
    // au milieu du titre. Le code brut est moins parlant mais reste lisible.
    return LABELLED_MODES.has(mode)
      ? `AFFAIRES.wizard.billing.mode_config.${mode}`
      : mode;
  }

  onSubDraftChange(updated: AffaireDraftState): void {
    this.draftChange.emit(updated);
  }
}
