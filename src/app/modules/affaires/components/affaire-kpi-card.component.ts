import { Component, input } from '@angular/core';

@Component({
  selector: 'app-affaire-kpi-card',
  template: `
    <div class="kpi-card" [class]="'kpi-card--' + variant()">
      <div class="kpi-top">
        <span class="kpi-label">{{ label() }}</span>
        <div class="kpi-icon">
          <span class="material-symbols-outlined">{{ icon() }}</span>
        </div>
      </div>
      <div class="kpi-bottom">
        <span class="kpi-value">{{ value() }}</span>
        @if (unit()) { <span class="kpi-unit">{{ unit() }}</span> }
        @if (trend()) { <span class="kpi-trend">{{ trend() }}</span> }
      </div>
    </div>
  `,
  styleUrl: './affaire-kpi-card.component.scss',
})
export class AffaireKpiCardComponent {
  label   = input.required<string>();
  icon    = input.required<string>();
  value   = input.required<string | number>();
  unit    = input<string>('');
  trend   = input<string>('');
  variant = input<'green' | 'blue' | 'amber' | 'red'>('blue');
}
