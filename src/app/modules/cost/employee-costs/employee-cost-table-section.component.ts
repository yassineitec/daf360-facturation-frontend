import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DataTableComponent, SortDirection, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { EmployeeCostDto } from './employee-cost.model';
import {
  STATUS_BADGE_VARIANT, displayName, formatAmount, formatPeriod, initials, statusKey,
} from './employee-cost-display';

/**
 * List view of the Coûts collaborateurs screen, on the house table style (same as
 * ../tabs/cost-lines-table-section.component.ts): no wrapper, no outer card, column
 * headers shown (`showHeader: true`), row actions declared through `TableConfig.actions`
 * rather than a projected `_actions` column — the newer of the two row-action patterns
 * in this codebase (see `TableAction`'s doc comment), so no custom cell template is
 * needed here.
 *
 * Sorting: `daf-data-table` sorts whatever page of rows it's handed, which would
 * normally only reorder the current page (§10b elsewhere in this app). Here that's
 * safe — the parent sorts the FULL filtered set before slicing into this page (see
 * `EmployeeCostComponent.sortedRows`), so `(sortChange)` is forwarded up to drive
 * that real sort, and the table's own redundant re-sort of the page it already
 * received either agrees with it or (for the `employee` avatar-object column, where
 * `row['employee']` isn't a plain string) compares everything equal and leaves the
 * parent's order untouched.
 *
 * Stateless: rows in, `(edit)` / `(remove)` / `(sortChange)` out.
 */
@Component({
  selector: 'app-employee-cost-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="edit.emit($event['_raw'])"
      (sortChange)="sortChange.emit($event)" />
  `,
})
export class EmployeeCostTableSectionComponent {
  private readonly translate = inject(TranslateService);

  costs        = input.required<EmployeeCostDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  pageSize     = input(25);

  readonly edit       = output<EmployeeCostDto>();
  readonly remove     = output<EmployeeCostDto>();
  readonly sortChange = output<{ key: string; dir: SortDirection }>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'employee', label: t('COST.EMPLOYEE_COST.COL_EMPLOYEE'), type: 'avatar', sortable: true },
      { key: 'basic',    label: t('COST.EMPLOYEE_COST.COL_BASIC'),    type: 'text', sortable: true },
      { key: 'internal', label: t('COST.EMPLOYEE_COST.COL_INTERNAL'), type: 'text', sortable: true },
      { key: 'external', label: t('COST.EMPLOYEE_COST.COL_EXTERNAL'), type: 'text', sortable: true },
      { key: 'period',   label: t('COST.EMPLOYEE_COST.COL_PERIOD'),   type: 'text', sortable: true },
      { key: 'status',   label: t('COST.EMPLOYEE_COST.COL_STATUS'),   type: 'badge', sortable: true },
    ];
    // `sortable` here only drives the header arrow + a redundant re-sort of the page
    // this component was already handed — the real, full-set sort lives one level up
    // (see the class doc comment above).
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.costs().map(row => {
      const name = displayName(row);
      return {
        id: row.id,
        employee: {
          name,
          initials: initials(name),
          // Only shown once it's not simply repeating the name above it.
          subtitle: row.fullName?.trim() ? row.employeeEmail : undefined,
        },
        basic:    formatAmount(row.basicCost, row.currency),
        internal: formatAmount(row.internalSellingCost, row.currency),
        external: formatAmount(row.externalSellingCost, row.currency),
        period:   formatPeriod(row.dateDebut, row.dateFin),
        status: {
          label:   row.sourceStatus ? t(statusKey(row.sourceStatus)) : '—',
          options: {
            variant: row.sourceStatus ? STATUS_BADGE_VARIANT[row.sourceStatus] : 'neutral',
            dot: true, size: 'sm',
          },
        } satisfies BadgeCell,

        _raw: row,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      showHeader:   true,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: Math.min(this.pageSize(), 20),
      emptyMessage: this.emptyMessage(),
      actions: [
        { id: 'edit',   icon: 'stylus', tooltip: t('COST.EMPLOYEE_COST.EDIT'),
          onClick: row => this.edit.emit(row['_raw']) },
        { id: 'delete', icon: 'delete', tooltip: t('COST.EMPLOYEE_COST.DELETE'), variant: 'danger',
          onClick: row => this.remove.emit(row['_raw']) },
      ],
    };
  });
}
