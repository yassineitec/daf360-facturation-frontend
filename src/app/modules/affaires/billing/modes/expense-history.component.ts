import {
  ChangeDetectionStrategy, Component, OnInit, TemplateRef, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  DataTableComponent, FormFieldComponent, ModalService, SearchToolbarComponent,
} from '@khalilrebhiitec/daf360';
import type {
  BadgeCell, FilterField, FilterResult, SearchToolbarFilterConfig,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { BillingService, ExpenseDto } from '../billing.service';
import { FactListService } from '../../../../core/fact-list.service';
import { UserStore } from '../../../../core/user.store';
import { AffaireDetail } from '../../affaire.model';
import { ListValueDto } from '../../../cost/cost.model';
import { DisplayCurrencyPipe } from '../../../../shared/display-currency.pipe';
import { EXPENSE_STATUT_BADGE, humanise } from '../../../../shared/enum-labels';

/**
 * Historique des frais remboursables d'une affaire — l'onglet « Frais » de la fiche.
 *
 * Il portait auparavant le formulaire de saisie dans le même panneau ; les deux sont
 * séparés (`app-expense-form`) pour que la modale de saisie ne contienne qu'un
 * formulaire et que la consultation ait sa place propre.
 *
 * Tableau, recherche, filtre et modales viennent de la lib — plus de `<table>` à la
 * main ni de fenêtre de refus maison.
 */
@Component({
  selector: 'app-expense-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, SearchToolbarComponent, DataTableComponent, FormFieldComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-4">
      <daf-search-toolbar
        [placeholder]="'AFFAIRES.EXPENSES.HISTORY.SEARCH' | translate"
        [value]="search()"
        [debounce]="300"
        (valueChange)="search.set($event)"
        [filterFields]="filterFields()"
        [filterConfig]="filterConfig()"
        (filterApply)="onFilter($event)"
        (filterReset)="statut.set('')" />

      <daf-data-table [columns]="columns()" [rows]="rows()" [config]="config()" />
    </div>

    <ng-template #refuseTpl>
      <daf-form-field
        [options]="motifOptions()"
        [value]="motif()"
        (valueChange)="motif.set(($any($event) ?? '') + '')" />
    </ng-template>
  `,
})
export class ExpenseHistoryComponent implements OnInit {
  affaire = input.required<AffaireDetail>();

  private readonly svc       = inject(BillingService);
  private readonly listSvc   = inject(FactListService);
  private readonly store     = inject(UserStore);
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);
  private readonly modals    = inject(ModalService);

  private readonly refuseTpl = viewChild.required<TemplateRef<unknown>>('refuseTpl');

  private readonly expenses   = signal<ExpenseDto[]>([]);
  private readonly categories = signal<ListValueDto[]>([]);
  readonly loading = signal(false);

  readonly search = signal('');
  readonly statut = signal('');
  readonly motif  = signal('');
  private refuseTarget: ExpenseDto | null = null;

  /** Seul le valideur (RF) voit les actions de validation / refus. */
  private readonly canValidate = computed(() => this.store.hasPermission('FACT_VALIDATE_RF'));

  ngOnInit(): void {
    this.listSvc.getListValues('EXPENSE_CATEGORY', this.affaire().paysId)
      .subscribe(v => this.categories.set(v));
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.svc.getExpenses(this.affaire().id).subscribe({
      next:  e => { this.expenses.set(e); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Filtres ─────────────────────────────────────────────────────────────

  readonly filterFields = computed<FilterField[]>(() => {
    this.translate.currentLang();
    return [{
      name: 'statut',
      label: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.COL_STATUS'),
      type: 'select',
      placeholder: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.ALL'),
      options: Object.keys(EXPENSE_STATUT_BADGE).map(code => ({
        value: code,
        label: this.translate.instant('ENUMS.EXPENSE_STATUT.' + code),
      })),
    }];
  });

  readonly filterConfig = computed<SearchToolbarFilterConfig>(() => {
    this.translate.currentLang();
    return {
      title:        this.translate.instant('AFFAIRES.EXPENSES.HISTORY.FILTERS'),
      applyLabel:   this.translate.instant('AFFAIRES.EXPENSES.HISTORY.APPLY'),
      cancelLabel:  this.translate.instant('AFFAIRES.EXPENSES.HISTORY.CANCEL'),
      resetLabel:   this.translate.instant('AFFAIRES.EXPENSES.HISTORY.RESET'),
      triggerLabel: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.FILTERS'),
      initialValues: { statut: this.statut() ? [this.statut()] : [] },
    };
  });

  onFilter(r: FilterResult): void {
    this.statut.set((r['statut'] as string | null) ?? '');
  }

  // ── Tableau ─────────────────────────────────────────────────────────────

  readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (k: string) => this.translate.instant('AFFAIRES.EXPENSES.HISTORY.' + k);
    return [
      { key: 'date',      label: t('COL_DATE'),     type: 'text' },
      { key: 'categorie', label: t('COL_CATEGORY'), type: 'text' },
      { key: 'montant',   label: t('COL_AMOUNT'),   type: 'text', align: 'right' },
      { key: 'receipt',   label: t('COL_RECEIPT'),  type: 'text' },
      { key: 'statut',    label: t('COL_STATUS'),   type: 'badge' },
      { key: 'motif',     label: t('COL_REASON'),   type: 'text' },
    ];
  });

  private readonly filtered = computed(() => {
    const q  = this.search().trim().toLowerCase();
    const st = this.statut();
    return this.expenses().filter(e => {
      if (st && e.statut !== st) return false;
      if (!q) return true;
      const cat = this.categoryLabel(e.expenseCategoryId).toLowerCase();
      return cat.includes(q)
        || (e.commentaire ?? '').toLowerCase().includes(q)
        || (e.justificatifName ?? '').toLowerCase().includes(q);
    });
  });

  readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.filtered().map(e => ({
      id:        e.id,
      date:      this.formatDate(e.expenseDate),
      categorie: this.categoryLabel(e.expenseCategoryId),
      montant:   this.currency.transform(e.montant, e.devise ?? 'EUR'),
      // Le nom du fichier plutôt qu'une icône : il dit AUSSI qu'il n'y en a pas, ce qui
      // est une information réelle depuis que le justificatif est facultatif.
      receipt:   e.justificatifName
        ?? this.translate.instant('AFFAIRES.EXPENSES.HISTORY.NO_RECEIPT'),
      statut: {
        label:   this.translate.instant('ENUMS.EXPENSE_STATUT.' + e.statut),
        options: { variant: EXPENSE_STATUT_BADGE[e.statut] ?? 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      motif: e.motifRejet ?? '—',
      _raw:  e,
    }));
  });

  readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      emptyMessage: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.EMPTY'),
      actions: [
        {
          id: 'validate',
          icon: 'check_circle',
          tooltip: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.VALIDATE'),
          hidden: (row: TableRow) =>
            !this.canValidate() || (row['_raw'] as ExpenseDto).statut !== 'EN_ATTENTE',
          onClick: (row: TableRow) => this.validate(row['_raw'] as ExpenseDto),
        },
        {
          id: 'refuse',
          icon: 'cancel',
          tooltip: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.REFUSE'),
          hidden: (row: TableRow) =>
            !this.canValidate() || (row['_raw'] as ExpenseDto).statut !== 'EN_ATTENTE',
          onClick: (row: TableRow) => this.openRefuse(row['_raw'] as ExpenseDto),
        },
      ],
    };
  });

  // ── Actions ─────────────────────────────────────────────────────────────

  private validate(e: ExpenseDto): void {
    this.svc.validateExpense(e.id).subscribe({ next: () => this.load() });
  }

  readonly motifOptions = computed(() => {
    this.translate.currentLang();
    return {
      type: 'textarea' as const, rows: 3, maxLength: 500, required: true,
      label: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.REASON_LABEL'),
      placeholder: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.REASON_PH'),
      fullWidth: true,
    };
  });

  private openRefuse(e: ExpenseDto): void {
    this.refuseTarget = e;
    this.motif.set('');
    const ref = this.modals.open({
      title: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.REFUSE_TITLE'),
      icon:  'cancel',
      size:  'md',
      body:  this.refuseTpl(),
      buttons: [
        { label: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.CANCEL'), variant: 'secondary', action: r => r.close() },
        {
          label: this.translate.instant('AFFAIRES.EXPENSES.HISTORY.CONFIRM'),
          // `ModalButton.variant` ne connaît que 'primary' | 'secondary' : pas de teinte
          // destructive côté lib. Le titre et le libellé portent donc le sens.
          variant: 'primary',
          action: () => {
            const m = this.motif().trim();
            if (!m || !this.refuseTarget) return;
            this.svc.refuseExpense(this.refuseTarget.id, m).subscribe({
              next: () => { ref.close(); this.load(); },
            });
          },
        },
      ],
    });
  }

  // ── Rendu ───────────────────────────────────────────────────────────────

  private categoryLabel(id: number): string {
    return this.categories().find(c => c.id === id)?.labelFr ?? humanise(String(id));
  }

  private formatDate(d: string | null): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR',
      { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
}
