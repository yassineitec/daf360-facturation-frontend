import { Component, computed, input } from '@angular/core';
import { CardComponent } from '@khalilrebhiitec/daf360';

const ICON_BG: Record<string, string> = {
  green: 'bg-secondary/10',
  blue:  'bg-teal/10',
  amber: 'bg-warning/10',
  red:   'bg-danger/10',
};

const ICON_COLOR: Record<string, string> = {
  green: 'text-secondary',
  blue:  'text-teal',
  amber: 'text-warning',
  red:   'text-danger',
};

const DELTA_COLOR: Record<string, string> = {
  green: 'text-secondary',
  blue:  'text-on-surface-variant',
  amber: 'text-warning',
  red:   'text-danger',
};

@Component({
  selector: 'app-affaire-kpi-card',
  imports: [CardComponent],
  template: `
    <daf-card [options]="{variant:'glass', padding:'none', radius:'xl', hoverable:true}">
      <div class="p-4 flex flex-col justify-between" style="min-height:112px">

        <div class="flex justify-between items-start mb-3">
          <span class="text-label-caps text-on-surface-variant flex-1 pr-2">{{ label() }}</span>
          <div [class]="'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' + iconBg()">
            <span [class]="'material-symbols-outlined text-sm ' + iconColor()">{{ icon() }}</span>
          </div>
        </div>

        <div>
          <p class="text-[22px] font-black leading-tight text-on-surface">
            {{ value() }}@if (unit()) { <span class="text-[14px] font-semibold text-on-surface-variant ml-1">{{ unit() }}</span> }
          </p>
          @if (trend()) {
            <p [class]="'text-[10px] font-bold mt-1 ' + deltaColor()">{{ trend() }}</p>
          }
        </div>

      </div>
    </daf-card>
  `,
  styles: [':host { display: block; }'],
})
export class AffaireKpiCardComponent {
  label   = input.required<string>();
  icon    = input.required<string>();
  value   = input.required<string | number>();
  unit    = input<string>('');
  trend   = input<string>('');
  variant = input<'green' | 'blue' | 'amber' | 'red'>('blue');

  iconBg    = computed(() => ICON_BG[this.variant()]    ?? 'bg-primary/10');
  iconColor = computed(() => ICON_COLOR[this.variant()] ?? 'text-primary');
  deltaColor = computed(() => DELTA_COLOR[this.variant()] ?? 'text-on-surface-variant');
}
