import { Component, signal, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import { WizardStepperComponent } from '../../shared/wizard-stepper.component';
import { StepAffaireComponent, StepAffaireValue } from './steps/step-affaire.component';
import { StepLinesComponent,  StepLinesValue  } from './steps/step-lines.component';
import { StepConditionsComponent, StepConditionsValue } from './steps/step-conditions.component';
import { StepRecapComponent } from './steps/step-recap.component';

type Step = 1 | 2 | 3 | 4;

const STEP_LABELS = ['Affaire & Client', 'Lignes', 'Conditions', 'Récapitulatif'];

const STEP_INFO = [
  { title: 'Initialisation de la facture',  sub: "Sélectionnez l'affaire concernée et le type de document à générer."  },
  { title: 'Lignes de facturation',         sub: 'Ajoutez les prestations, quantités et montants à facturer.'           },
  { title: 'Conditions de paiement',        sub: "Définissez les modalités et l'échéance de paiement."                  },
  { title: 'Récapitulatif & Validation',    sub: 'Vérifiez les informations avant de créer la facture.'                  },
];

@Component({
  selector: 'app-invoice-new',
  standalone: true,
  imports: [WizardStepperComponent, StepAffaireComponent, StepLinesComponent, StepConditionsComponent, StepRecapComponent],
  templateUrl: './invoice-new.component.html',
  styleUrl:    './invoice-new.component.scss',
})
export class InvoiceNewComponent {
  private readonly router = inject(Router);

  step            = signal<Step>(1);
  affaireValue    = signal<StepAffaireValue   | null>(null);
  linesValue      = signal<StepLinesValue     | null>(null);
  conditionsValue = signal<StepConditionsValue | null>(null);

  readonly stepLabels = STEP_LABELS;

  readonly stepTitle = computed(() => STEP_INFO[this.step() - 1].title);
  readonly stepSub   = computed(() => STEP_INFO[this.step() - 1].sub);

  tiltTransform = signal('rotateX(0deg) rotateY(0deg) translateY(0px)');

  onTilt(e: MouseEvent): void {
    const target = e.currentTarget as HTMLElement;
    const rect   = target.getBoundingClientRect();
    const x      = e.clientX - rect.left;
    const y      = e.clientY - rect.top;
    const rx     = (((y - rect.height / 2) / 25)).toFixed(2);
    const ry     = (((rect.width  / 2 - x)  / 25)).toFixed(2);
    this.tiltTransform.set(`rotateX(${rx}deg) rotateY(${ry}deg) translateY(-8px)`);
  }

  resetTilt(): void {
    this.tiltTransform.set('rotateX(0deg) rotateY(0deg) translateY(0px)');
  }

  onAffaireDone(v: StepAffaireValue):      void { this.affaireValue.set(v);    this.step.set(2); }
  onLinesDone(v: StepLinesValue):          void { this.linesValue.set(v);      this.step.set(3); }
  onConditionsDone(v: StepConditionsValue): void { this.conditionsValue.set(v); this.step.set(4); }
  cancel(): void { this.router.navigate(['/fact/invoicing']); }
}
