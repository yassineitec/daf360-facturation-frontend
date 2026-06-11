import { Component, input, computed } from '@angular/core';
import {
  InvoiceStatut, INVOICE_TIMELINE_STEPS, INVOICE_STATUT_CONFIG,
} from '../modules/invoicing/invoice.model';

interface TimelineStep {
  key: string;
  label: string;
  state: 'done' | 'active' | 'pending';
}

@Component({
  selector: 'app-invoice-status-timeline',
  imports: [],
  template: `
<div class="timeline-wrap">
  <div class="timeline-track">
    @for (step of mainSteps(); track step.key; let last = $last) {
      <div class="tl-step" [class.done]="step.state === 'done'" [class.active]="step.state === 'active'">
        <div class="tl-dot">
          @if (step.state === 'done') {
            <svg viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="white" stroke-width="1.8" stroke-linecap="round"/></svg>
          }
        </div>
        <span class="tl-label">{{ step.label }}</span>
      </div>
      @if (!last) { <div class="tl-line" [class.done]="step.state === 'done'"></div> }
    }
  </div>

  @if (showBranch()) {
    <div class="tl-branch">
      <div class="tl-branch-line"></div>
      <div class="tl-step" [class.active]="statut() === 'DISPUTED'" [class.done]="false">
        <div class="tl-dot tl-dot--litige"></div>
        <span class="tl-label tl-label--litige">En litige</span>
      </div>
      @if (statut() === 'CANCELLED') {
        <div class="tl-branch-line"></div>
        <div class="tl-step tl-step--active">
          <div class="tl-dot tl-dot--annulee"></div>
          <span class="tl-label tl-label--annulee">Annulée</span>
        </div>
      }
    </div>
  }
</div>
  `,
  styleUrl: './invoice-status-timeline.component.scss',
})
export class InvoiceStatusTimelineComponent {
  statut = input.required<InvoiceStatut | string>();

  readonly LABELS: Record<string, string> = {
    DRAFT:          'Brouillon',
    SUBMITTED:      'En revue',
    APPROVED:       'Validée',
    EMITTED:        'Émise',
    SENT:           'Envoyée',
    PARTIALLY_PAID: 'Part. payée',
    PAID:           'Payée',
  };

  readonly mainSteps = computed<TimelineStep[]>(() => {
    const s = this.statut();
    const activeIdx = INVOICE_TIMELINE_STEPS.indexOf(s);
    return INVOICE_TIMELINE_STEPS.map((key, i) => ({
      key,
      label: this.LABELS[key] ?? key,
      state: i < activeIdx ? 'done' : i === activeIdx ? 'active' : 'pending',
    }));
  });

  readonly showBranch = computed(() =>
    ['DISPUTED', 'CANCELLED'].includes(this.statut() as string)
  );
}
