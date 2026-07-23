import { Component, Input, inject, computed } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';

import { AffaireDraftState, BILLING_MODES, BUDGET_LABEL } from '../../affaire-wizard.model';

@Component({
  selector: 'app-wizard-step-recap',
  standalone: true,
  imports: [DecimalPipe, DatePipe, DataTableComponent, DafCellDirective, TranslatePipe],
  templateUrl: './wizard-step-recap.component.html',
  styleUrl: './wizard-step-recap.component.scss',
})
export class WizardStepRecapComponent {
  @Input() draft!: AffaireDraftState;
  @Input() draftId!: number | null;

  private readonly translate = inject(TranslateService);

  getModeOption()  { return BILLING_MODES.find(m => m.code === this.draft.billingMode); }
  getModeLabelFr() { return this.getModeOption()?.labelFr ?? this.draft.billingMode ?? '—'; }
  getModeIcon()    { return this.getModeOption()?.icon ?? 'receipt'; }
  getBudgetLabel() { return this.draft.billingMode ? BUDGET_LABEL[this.draft.billingMode].label : this.translate.instant('AFFAIRES.wizard.recap.budget_fallback'); }

  // ── Static table config (no loading/skeleton state — read-only recap step) ──
  readonly tableConfig: TableConfig = {
    hoverable: false,
    striped:   false,
  };

  // ── Section B: Responsables table ────────────────────────────────────────
  get responsablesColumns(): TableColumn[] {
    const cols: TableColumn[] = [
      { key: 'responsable', label: this.translate.instant('AFFAIRES.wizard.recap.col_responsable'), type: 'custom' },
      { key: 'role',        label: this.translate.instant('AFFAIRES.wizard.recap.col_role'),        type: 'text' },
    ];
    if (this.draft.budgetPrevisionnel) {
      cols.push(
        { key: 'budgetAllocation', label: this.translate.instant('AFFAIRES.wizard.recap.col_budget'), type: 'custom', align: 'right' },
        { key: 'percentage',       label: this.translate.instant('AFFAIRES.wizard.recap.col_pct'),    type: 'custom', align: 'right' },
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
      role:             r.role || this.translate.instant('AFFAIRES.wizard.shell.dash'),
      budgetAllocation: r.budgetAllocation ?? 0,
      percentage:       budget ? (r.budgetAllocation ?? 0) / budget * 100 : null,
      currency:         this.draft.contractCurrency,
    }));
  }

  // ── Section D / AV: Répartitions table ───────────────────────────────────
  readonly repartitionsColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'typeLabel',  label: this.translate.instant('AFFAIRES.wizard.recap.col_type_repartition'), type: 'text' },
      { key: 'percentage', label: this.translate.instant('AFFAIRES.wizard.recap.col_percentage'),       type: 'custom', align: 'right' },
    ];
  });

  get repartitionsRows() {
    return this.draft.repartitions.map(r => ({
      typeLabel:  this.translate.instant('AFFAIRES.wizard.recap.type_id_hash', { id: r.repartitionTypeId }),
      percentage: r.percentage,
    }));
  }

  // ── Section D / JAL: Jalons table ────────────────────────────────────────
  readonly jalonsColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'jalon',  label: this.translate.instant('AFFAIRES.wizard.recap.col_jalon'),     type: 'custom' },
      { key: 'date',   label: this.translate.instant('AFFAIRES.wizard.recap.col_date_prev'), type: 'custom' },
      { key: 'montant',label: this.translate.instant('AFFAIRES.wizard.recap.col_montant'),   type: 'custom', align: 'right' },
    ];
  });

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
  readonly ressourcesColumns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    return [
      { key: 'collaborateur', label: this.translate.instant('AFFAIRES.wizard.recap.col_collaborateur'), type: 'custom' },
      { key: 'rateType',      label: this.translate.instant('AFFAIRES.wizard.recap.col_rate_type'),     type: 'custom' },
      { key: 'rateAmount',    label: this.translate.instant('AFFAIRES.wizard.recap.col_rate'),          type: 'custom', align: 'right' },
      { key: 'costAmount',    label: this.translate.instant('AFFAIRES.wizard.recap.col_internal_cost'), type: 'custom', align: 'right' },
    ];
  });

  get ressourcesRows() {
    return this.draft.ressources.map(r => ({
      userName:     r.userName ?? this.translate.instant('AFFAIRES.wizard.recap.user_hash', { id: r.userId }),
      resourceType: r.resourceType,
      rateType:     r.rateType === 'DAILY' ? 'JH' : 'H',
      rateAmount:   r.rateAmount,
      rateCurrency: r.rateCurrency,
      costAmount:   r.costAmount,
    }));
  }
}
