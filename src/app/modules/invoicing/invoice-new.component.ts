import { Component, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StepAffaireComponent, StepAffaireValue } from './steps/step-affaire.component';
import { StepLinesComponent,  StepLinesValue  } from './steps/step-lines.component';
import { StepConditionsComponent, StepConditionsValue } from './steps/step-conditions.component';
import { StepRecapComponent } from './steps/step-recap.component';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Affaire & Client', 'Lignes', 'Conditions', 'Récapitulatif'];

@Component({
  selector: 'app-invoice-new',
  imports: [RouterLink, StepAffaireComponent, StepLinesComponent, StepConditionsComponent, StepRecapComponent],
  templateUrl: './invoice-new.component.html',
  styleUrl:    './invoice-new.component.scss',
})
export class InvoiceNewComponent {
  step = signal<Step>(1);

  affaireValue   = signal<StepAffaireValue | null>(null);
  linesValue     = signal<StepLinesValue | null>(null);
  conditionsValue = signal<StepConditionsValue | null>(null);

  readonly stepLabels = STEP_LABELS;

  readonly stepProgress = computed(() => this.step());

  onAffaireDone(v: StepAffaireValue):    void { this.affaireValue.set(v);    this.step.set(2); }
  onLinesDone(v: StepLinesValue):        void { this.linesValue.set(v);      this.step.set(3); }
  onConditionsDone(v: StepConditionsValue): void { this.conditionsValue.set(v); this.step.set(4); }
}
