import { Component, Input } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';

import { AffaireDraftState, BILLING_MODES, BUDGET_LABEL } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-recap',
  standalone: true,
  imports: [DecimalPipe, DatePipe, DataTableComponent, DafCellDirective],
  templateUrl: './wizard-step-recap.component.html',
  styleUrl: './wizard-step-recap.component.scss',
})
export class WizardStepRecapComponent {
  @Input() draft!: AffaireDraftState;
  @Input() draftId!: number | null;

  getModeOption()  { return BILLING_MODES.find(m => m.code === this.draft.billingMode); }
  getModeLabelFr() { return this.getModeOption()?.labelFr ?? this.draft.billingMode ?? '—'; }
  getModeIcon()    { return this.getModeOption()?.icon ?? 'receipt'; }
  getBudgetLabel() { return this.draft.billingMode ? BUDGET_LABEL[this.draft.billingMode].label : 'Budget'; }

  // ── Static table config (no loading/skeleton state — read-only recap step) ──
  readonly tableConfig: TableConfig = {
    hoverable: false,
    striped:   false,
  };

  // ── Section B: Responsables table ────────────────────────────────────────
  get responsablesColumns(): TableColumn[] {
    const cols: TableColumn[] = [
      { key: 'responsable', label: 'Responsable', type: 'custom' },
      { key: 'role',        label: 'Rôle',        type: 'text' },
    ];
    if (this.draft.budgetPrevisionnel) {
      cols.push(
        { key: 'budgetAllocation', label: 'Budget alloué', type: 'custom', align: 'right' },
        { key: 'percentage',       label: '%',             type: 'custom', align: 'right' },
      );
    }
    return cols;
  }

  get responsablesRows() {
    const budget = this.draft.budgetPrevisionnel;
    return this.draft.responsables.map(r => ({
      userName:         r.userName,
      isPrimary:        r.isPrimary,
      activiteLabel:    r.activiteLabel,
      disciplineLabel:  r.disciplineLabel,
      role:             r.role || '—',
      budgetAllocation: r.budgetAllocation ?? 0,
      percentage:       budget ? (r.budgetAllocation ?? 0) / budget * 100 : null,
      currency:         this.draft.contractCurrency,
    }));
  }

  // ── Section D / AV: Répartitions table ───────────────────────────────────
  readonly repartitionsColumns: TableColumn[] = [
    { key: 'typeLabel',  label: 'Type de répartition', type: 'text' },
    { key: 'percentage', label: 'Pourcentage',         type: 'custom', align: 'right' },
  ];

  get repartitionsRows() {
    return this.draft.repartitions.map(r => ({
      typeLabel:  `Type ID #${r.repartitionTypeId}`,
      percentage: r.percentage,
    }));
  }

  // ── Section D / JAL: Jalons table ────────────────────────────────────────
  readonly jalonsColumns: TableColumn[] = [
    { key: 'jalon',  label: 'Jalon',                type: 'custom' },
    { key: 'date',   label: 'Date prévisionnelle',   type: 'custom' },
    { key: 'montant',label: 'Montant',               type: 'custom', align: 'right' },
  ];

  get jalonsRows() {
    return this.draft.jalons.map((j, i) => ({
      index:       i + 1,
      label:       j.label,
      description: j.description,
      date:        j.datePrevisionnelle,
      montant:     j.montant,
      currency:    this.draft.contractCurrency,
    }));
  }

  // ── Section D / TM: Ressources table ─────────────────────────────────────
  readonly ressourcesColumns: TableColumn[] = [
    { key: 'collaborateur', label: 'Collaborateur', type: 'custom' },
    { key: 'rateType',      label: 'Type taux',     type: 'custom' },
    { key: 'rateAmount',    label: 'Taux',          type: 'custom', align: 'right' },
    { key: 'costAmount',    label: 'Coût interne',  type: 'custom', align: 'right' },
  ];

  get ressourcesRows() {
    return this.draft.ressources.map(r => ({
      userName:     r.userName ?? `User #${r.userId}`,
      resourceType: r.resourceType,
      rateType:     r.rateType === 'DAILY' ? 'JH' : 'H',
      rateAmount:   r.rateAmount,
      rateCurrency: r.rateCurrency,
      costAmount:   r.costAmount,
    }));
  }
}
