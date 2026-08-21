import { Component, Input, OnInit, inject, computed, signal } from '@angular/core';
import { DecimalPipe, DatePipe } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, DafCellDirective, TableColumn, TableConfig,
} from '@khalilrebhiitec/daf360';

import { CostService }       from '../../../cost/cost.service';
import { FactListService }   from '../../../../core/fact-list.service';
import { AffaireDraftState, BILLING_MODES, BUDGET_LABEL } from '../../affaire-wizard.model';
import { ClientContactService } from '../../../clients/contacts/client-contact.service';
import { AffaireContactDto }    from '../../../clients/contacts/client-contact.model';

@Component({
  selector: 'app-wizard-step-recap',
  standalone: true,
  imports: [DecimalPipe, DatePipe, DataTableComponent, DafCellDirective, TranslatePipe],
  templateUrl: './wizard-step-recap.component.html',
  styleUrl: './wizard-step-recap.component.scss',
})
export class WizardStepRecapComponent implements OnInit {
  @Input() draft!: AffaireDraftState;
  @Input() draftId!: number | null;

  private readonly translate = inject(TranslateService);
  private readonly costSvc   = inject(CostService);
  private readonly listSvc   = inject(FactListService);
  private readonly contactSvc = inject(ClientContactService);

  /**
   * Les référentiels des catégories, chargés ici aussi.
   *
   * Le brouillon ne transporte que des **identifiants** (`eligibleCostCategoryIds`,
   * `eligibleExpenseCategoryIds`) : côté backend comme côté saisie, aucun libellé n'est
   * conservé. Le récapitulatif affichait donc « Catégorie #12 », ce qui ne veut rien dire
   * pour le lecteur — et c'est précisément l'écran censé permettre une relecture avant
   * activation. On résout donc les noms au chargement de l'étape, ce qui marche aussi
   * bien à la création qu'à la reprise d'un brouillon.
   */
  private readonly costCategories    = signal<{ id: number; label: string }[]>([]);
  private readonly expenseCategories = signal<{ id: number; label: string }[]>([]);

  /**
   * Les contacts RÉELLEMENT enregistrés sur l'affaire, relus depuis le serveur.
   *
   * Le brouillon ne transporte que des identifiants, et surtout : c'est ici qu'on
   * relit avant d'activer. Afficher la sélection locale montrerait ce qu'on croit
   * avoir enregistré ; relire montre ce qui l'est.
   */
  readonly contacts = signal<AffaireContactDto[]>([]);

  ngOnInit(): void {
    if (this.draftId) {
      this.contactSvc.getAffaireContacts(this.draftId)
        .subscribe(list => this.contacts.set(list));
    }

    const paysId = Number(this.draft.paysId);
    if (!paysId) return;

    if (this.draft.eligibleCostCategoryIds.length) {
      this.costSvc.getCategories(paysId).subscribe(list =>
        this.costCategories.set(list.map(c => ({
          id: c.id,
          label: `${String(c.categoryNumber).padStart(2, '0')} — ${c.labelFr}`,
        }))));
    }
    if (this.draft.eligibleExpenseCategoryIds.length) {
      this.listSvc.getListValues('EXPENSE_CATEGORY', paysId).subscribe(list =>
        this.expenseCategories.set(list.map(c => ({ id: c.id, label: c.labelFr }))));
    }
  }

  /** Noms des catégories de coût retenues (CP) — repli sur l'id tant que la liste charge. */
  readonly costCategoryLabels = computed(() =>
    this.draft.eligibleCostCategoryIds.map(id =>
      this.costCategories().find(c => c.id === id)?.label
        ?? this.translate.instant('AFFAIRES.wizard.recap.category_hash', { id })));

  /** Noms des catégories de frais retenues (RMB). */
  readonly expenseCategoryLabels = computed(() =>
    this.draft.eligibleExpenseCategoryIds.map(id =>
      this.expenseCategories().find(c => c.id === id)?.label
        ?? this.translate.instant('AFFAIRES.wizard.recap.category_hash', { id })));

  getModeOption() { return BILLING_MODES.find(m => m.code === this.draft.billingMode); }

  /**
   * Le nom du mode, traduit. Passe par `shell.mode.<CODE>` plutôt que par
   * `BILLING_MODES` : un mode hérité qui n'est plus proposé à la création (RMB) n'est
   * plus dans cette liste, et le récapitulatif d'une affaire existante doit quand
   * même savoir le nommer.
   */
  getModeLabel() {
    const mode = this.draft.billingMode;
    if (!mode) return this.translate.instant('AFFAIRES.wizard.shell.dash');
    const key   = `AFFAIRES.wizard.shell.mode.${mode}`;
    const label = this.translate.instant(key);
    return label === key ? mode : label;
  }

  getModeIcon()    { return this.getModeOption()?.icon ?? 'receipt'; }

  getBudgetLabel() {
    const mode = this.draft.billingMode;
    return mode && BUDGET_LABEL[mode]
      ? this.translate.instant(BUDGET_LABEL[mode].labelKey)
      : this.translate.instant('AFFAIRES.wizard.recap.budget_fallback');
  }

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
      // Le libellé du type (CTR / BPE / TQC) est porté par la ligne, en saisie comme en
      // relecture ; « Type #3 » n'est plus qu'un repli si le référentiel a changé.
      typeLabel:  r.label || this.translate.instant('AFFAIRES.wizard.recap.type_id_hash', { id: r.repartitionTypeId }),
      percentage: r.percentage,
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
