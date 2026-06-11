import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-raf-gauge',
  template: `
    <div class="raf-gauge">
      <div class="gauge-header">
        <span class="gauge-label">RAF disponible</span>
        <span class="gauge-values">
          <span [style.color]="barColor()">{{ formatAmount(raf()) }}</span>
          <span class="gauge-sep"> / </span>
          <span class="gauge-budget">{{ formatAmount(budget()) }}</span>
        </span>
      </div>
      <div class="gauge-track">
        <div class="gauge-fill"
             [style.width.%]="fillPct()"
             [style.background]="barColor()">
        </div>
      </div>
      <div class="gauge-footer">
        <span class="gauge-pct" [style.color]="barColor()">{{ formatPct(rafPct()) }}% restant</span>
        @if (seuilPct() > 0) {
          <span class="gauge-seuil">Seuil alerte: {{ seuilPct() }}%</span>
        }
      </div>
    </div>
  `,
  styleUrl: './raf-gauge.component.scss',
  imports: [],
})
export class RafGaugeComponent {
  raf      = input.required<number>();
  budget   = input.required<number>();
  seuilPct = input<number>(10);
  devise   = input<string>('TND');

  rafPct  = computed(() => this.budget() > 0 ? (this.raf() / this.budget()) * 100 : 0);
  fillPct = computed(() => Math.max(0, Math.min(100, this.rafPct())));

  barColor = computed(() => {
    const pct = this.rafPct();
    if (pct > 50)               return '#1a6b7c'; // teal
    if (pct > this.seuilPct())  return '#f59e0b'; // amber
    return '#dc2626';                              // red
  });

  formatPct(v: number): string {
    return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(v);
  }

  formatAmount(v: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency', currency: this.devise(),
      minimumFractionDigits: 0, maximumFractionDigits: 0,
    }).format(v);
  }
}
