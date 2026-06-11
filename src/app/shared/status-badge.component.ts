import { Component, computed, input } from '@angular/core';

interface StatusConfig {
  label:   string;
  bg:      string;
  color:   string;
  border:  string;
}

const STATUS_MAP: Record<string, StatusConfig> = {
  // Affaire statuses
  EN_COURS:  { label: 'En cours',  bg: '#e0f5f8', color: '#1a6b7c', border: '#1a6b7c' },
  SUSPENDUE: { label: 'Suspendue', bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  CLOTUREE:  { label: 'Clôturée',  bg: '#f1f5f9', color: '#475569', border: '#94a3b8' },
  ARCHIVEE:  { label: 'Archivée',  bg: '#f8fafc', color: '#94a3b8', border: '#e2e8f0' },

  // Invoice statuses (backend English keys)
  DRAFT:                 { label: 'Brouillon',             bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  SUBMITTED:             { label: 'En revue',              bg: '#dbeafe', color: '#1d4ed8', border: '#93c5fd' },
  RETURNED:              { label: 'Retournée',             bg: '#fff7ed', color: '#c2410c', border: '#fdba74' },
  APPROVED:              { label: 'Validée',               bg: '#e0e7ff', color: '#3730a3', border: '#a5b4fc' },
  EMITTED:               { label: 'Émise',                 bg: '#ccfbf1', color: '#0f766e', border: '#5eead4' },
  SENT:                  { label: 'Envoyée',               bg: '#b2e8f1', color: '#134f5c', border: '#1a6b7c' },
  PARTIALLY_PAID:        { label: 'Partiellement payée',   bg: '#fef3c7', color: '#92400e', border: '#f59e0b' },
  PAID:                  { label: 'Payée',                 bg: '#d1fae5', color: '#065f46', border: '#34d399' },
  DISPUTED:              { label: 'En litige',             bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  CANCELLED:             { label: 'Annulée',               bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' },
  CREDIT_NOTED:          { label: 'Avoir émis',            bg: '#f3e8ff', color: '#7c3aed', border: '#c4b5fd' },
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
      padding: 2px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 600;
      letter-spacing: 0.01em;
      border: 1px solid transparent;
      white-space: nowrap;
    }
  `],
})
export class StatusBadgeComponent {
  status = input.required<string>();
  cfg    = computed(() => STATUS_MAP[this.status()] ?? {
    label: this.status(), bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1',
  });
}
