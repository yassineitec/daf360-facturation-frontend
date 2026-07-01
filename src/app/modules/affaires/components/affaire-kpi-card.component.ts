import { Component, computed, input } from '@angular/core';
import { CardComponent } from '@khalilrebhiitec/daf360';

// Colors extracted directly from reference HTML tailwind config
const ICON_BG: Record<string, string> = {
  green: 'rgba(108,248,187,0.30)',  // bg-secondary-container/30
  blue:  'rgba(221,225,255,0.30)',  // bg-primary-fixed/30
  amber: 'rgba(255,221,184,0.30)',  // bg-tertiary-fixed/30
  red:   'rgba(255,218,214,0.30)',  // bg-error-container/30
};

const ICON_COLOR: Record<string, string> = {
  green: '#006c49',  // text-secondary
  blue:  '#00288e',  // text-primary
  amber: '#4c2e00',  // text-tertiary
  red:   '#ba1a1a',  // text-error
};

const TREND_CLASS: Record<string, string> = {
  green: 'kpi-trend--up',
  blue:  'kpi-trend--neutral',
  amber: 'kpi-trend--neutral',
  red:   'kpi-trend--down',
};

@Component({
  selector: 'app-affaire-kpi-card',
  imports: [CardComponent],
  template: `
    <daf-card [options]="{variant:'glass',padding:'none',radius:'xl',hoverable:true}">
      <div class="kpi-card">
        <div class="kpi-card__top">
          <span class="kpi-card__label">{{ label() }}</span>
          <div class="kpi-card__icon" [style.background]="iconBg()">
            <span class="material-symbols-outlined kpi-mat-icon"
                  [style.color]="iconColor()">{{ icon() }}</span>
          </div>
        </div>
        <div class="kpi-card__bottom">
          <span [class]="value().toString().length > 8 ? 'kpi-card__value kpi-card__value--sm' : 'kpi-card__value'">
            {{ value() }}
          </span>
          @if (unit()) {
            <span [class]="'kpi-card__trend ' + trendClass()">{{ unit() }}</span>
          }
          @if (trend()) {
            <span [class]="'kpi-card__trend ' + trendClass()">{{ trend() }}</span>
          }
        </div>
      </div>
    </daf-card>
  `,
  styles: [`
    .kpi-card {
      padding: 24px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 128px;
      position: relative;
      overflow: hidden;
    }
    .kpi-card__top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .kpi-card__label {
      font-size: 10px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      color: #3e4945;
    }
    .kpi-card__icon {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .kpi-card__bottom {
      display: flex;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
    }
    .kpi-card__value {
      font-size: 1.75rem;
      font-weight: 900;
      color: #0b1c30;
      line-height: 1;
    }
    .kpi-card__value--sm { font-size: 1.25rem; }
    .kpi-card__trend { font-size: 0.75rem; font-weight: 700; }
    .kpi-trend--up      { color: #006c49; }
    .kpi-trend--down    { color: #ba1a1a; }
    .kpi-trend--neutral { color: #64748b; }
  `],
})
export class AffaireKpiCardComponent {
  label   = input.required<string>();
  icon    = input.required<string>();
  value   = input.required<string | number>();
  unit    = input<string>('');
  trend   = input<string>('');
  variant = input<'green' | 'blue' | 'amber' | 'red'>('blue');

  iconBg    = computed(() => ICON_BG[this.variant()]    ?? ICON_BG['blue']);
  iconColor = computed(() => ICON_COLOR[this.variant()] ?? ICON_COLOR['blue']);
  trendClass = computed(() => TREND_CLASS[this.variant()] ?? 'kpi-trend--neutral');
}
