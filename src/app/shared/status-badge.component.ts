import { Component, computed, input } from '@angular/core';

interface StatusConfig {
  label:  string;
  bg:     string;
  color:  string;
  border: string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Affaire statuses — colours from reference design
  EN_COURS:  {
    label:  'En cours',
    bg:     'rgba(108, 248, 187, 0.2)',
    color:  '#00714d',
    border: 'rgba(0, 108, 73, 0.2)',
  },
  SUSPENDUE: {
    label:  'Suspendue',
    bg:     '#e7e8ea',
    color:  '#444653',
    border: 'rgba(117, 118, 132, 0.2)',
  },
  CLOTUREE:  {
    label:  'Clôturée',
    bg:     'rgba(196, 197, 213, 0.2)',
    color:  '#757684',
    border: 'rgba(117, 118, 132, 0.1)',
  },
  ARCHIVEE:  {
    label:  'Archivée',
    bg:     '#f3f4f6',
    color:  '#757684',
    border: 'transparent',
  },

  // Invoice statuses
  DRAFT:          { label: 'Brouillon',           bg: '#edeef0',              color: '#444653', border: 'transparent'                 },
  SUBMITTED:      { label: 'En revue',             bg: '#dbeafe',              color: '#1d4ed8', border: '#93c5fd'                     },
  RETURNED:       { label: 'Retournée',            bg: '#fff7ed',              color: '#c2410c', border: '#fdba74'                     },
  APPROVED:       { label: 'Validée',              bg: '#e0e7ff',              color: '#3730a3', border: '#a5b4fc'                     },
  EMITTED:        { label: 'Émise',                bg: '#ccfbf1',              color: '#0f766e', border: '#5eead4'                     },
  SENT:           { label: 'Envoyée',              bg: '#b2e8f1',              color: '#00288e', border: '#00288e'                     },
  PARTIALLY_PAID: { label: 'Part. payée',          bg: '#fef3c7',              color: '#92400e', border: '#f59e0b'                     },
  PAID:           { label: 'Payée',                bg: '#d1fae5',              color: '#006c49', border: '#34d399'                     },
  DISPUTED:       { label: 'En litige',            bg: '#ffdad6',              color: '#93000a', border: '#ba1a1a'                     },
  CANCELLED:      { label: 'Annulée',              bg: '#ffdad6',              color: '#93000a', border: '#ba1a1a'                     },
  CREDIT_NOTED:   { label: 'Avoir émis',           bg: '#f3e8ff',              color: '#7c3aed', border: '#c4b5fd'                     },
};

@Component({
  selector: 'app-status-badge',
  template: `
    <span class="badge"
          [style.background]="cfg().bg"
          [style.color]="cfg().color"
          [style.border-color]="cfg().border">
      {{ cfg().label || status() }}
    </span>
  `,
  styles: [`
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 3px 12px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 700;
      letter-spacing: 0.01em;
      border: 1px solid transparent;
      white-space: nowrap;
    }
  `],
})
export class StatusBadgeComponent {
  status = input.required<string>();
  cfg    = computed(() => STATUS_MAP[this.status()] ?? {
    label: this.status(), bg: '#edeef0', color: '#444653', border: 'transparent',
  });
}
