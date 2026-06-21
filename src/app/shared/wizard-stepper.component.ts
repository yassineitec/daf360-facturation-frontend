import { Component, input, computed } from '@angular/core';
import { NgStyle } from '@angular/common';

interface StepItem {
  label: string;
  index: number;
  state: 'active' | 'done' | 'pending';
}

@Component({
  selector: 'app-wizard-stepper',
  standalone: true,
  imports: [NgStyle],
  template: `
    <div class="stepper">
      <div class="stepper-row">

        <!-- Ligne de fond (grise) -->
        <div class="progress-track"></div>

        <!-- Ligne active (teal) — largeur calculée selon l'étape -->
        <div class="progress-fill"
          [ngStyle]="{ width: activeLineWidth() + '%' }">
        </div>

        @for (step of stepItems(); track step.index) {
          <div class="step-item">
            <div class="step-circle" [class]="'step-circle--' + step.state">
              @if (step.state === 'done') {
                <span class="material-symbols-outlined">check</span>
              } @else {
                <span class="step-num">{{ step.index }}</span>
              }
            </div>
            <span class="step-label" [class]="'step-label--' + step.state">
              {{ step.label }}
            </span>
          </div>
        }

      </div>
    </div>
  `,
  styleUrl: './wizard-stepper.component.scss',
})
export class WizardStepperComponent {
  steps        = input<string[]>([]);
  currentStep  = input<number>(1);

  stepItems = computed<StepItem[]>(() =>
    this.steps().map((label, i) => ({
      label,
      index: i + 1,
      state: i + 1 === this.currentStep() ? 'active'
           : i + 1 < this.currentStep()   ? 'done'
           : 'pending',
    }))
  );

  activeLineWidth = computed(() => {
    const total = this.steps().length;
    const cur   = this.currentStep();
    if (total <= 1) return 0;
    return Math.min(((cur - 1) / (total - 1)) * 100, 100);
  });
}
