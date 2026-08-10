import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import {
  APPROVAL_BADGE_VARIANT, STATUS_BADGE_VARIANT, approvalLevelKey, canEdit, canSubmit,
  formatDate, statusKey,
} from '../cost-display';

/**
 * List view of the Lignes de coût tab on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, icon-only row actions.
 *
 * Stateless: lines in, `(edit)` / `(submitLine)` out.
 */
@Component({
  selector: 'app-cost-lines-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)">

      <!-- Description carries its reference as a second line rather than spending a
           whole column on it. -->
      <ng-template dafCell="label" let-row>
        <div class="flex flex-col leading-snug">
          <span class="font-medium text-on-surface">{{ row['_label'] }}</span>
          @if (row['_reference']) {
            <span class="font-mono text-[11px] text-outline">{{ row['_reference'] }}</span>
          }
        </div>
      </ng-template>

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (row['_canSubmit']) {
            <fact-table-action icon="send" [tooltip]="tips().submit"
                               (action)="submitLine.emit(row['_raw'])" />
          }
          @if (row['_canEdit']) {
            <fact-table-action id="edit" [tooltip]="tips().edit" (action)="edit.emit(row['_raw'])" />
          }
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class CostLinesTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  lines        = input.required<CostLineDto[]>();
  categoryFor  = input.required<(id: number | null) => string>();
  loading      = input(false);
  emptyMessage = input('');
  pageSize     = input(25);

  readonly edit       = output<CostLineDto>();
  readonly submitLine = output<CostLineDto>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    return {
      edit:   this.translate.instant('COST.LINES.EDIT'),
      submit: this.translate.instant('COST.LINES.SUBMIT'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'label',    label: t('COST.LINES.COL_DESCRIPTION'), type: 'custom' },
      { key: 'category', label: t('COST.LINES.COL_CATEGORY'),    type: 'text'   },
      { key: 'date',     label: t('COST.LINES.COL_DATE'),        type: 'text'   },
      { key: 'net',      label: t('COST.LINES.COL_NET_AMOUNT'),  type: 'text', align: 'right' },
      { key: 'eur',      label: t('COST.LINES.COL_EUR'),         type: 'text', align: 'right' },
      { key: 'status',   label: t('COST.LINES.COL_STATUS'),      type: 'badge'  },
      { key: 'approval', label: t('COST.LINES.COL_APPROVAL'),    type: 'badge'  },
      { key: '_actions', label: '', align: 'right', width: '1%' },
    ];
    // No column is `sortable`: the lib sorts client-side over the one page it was
    // handed, and this list is server-paginated (§10b).
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const cat = this.categoryFor();

    return this.lines().map(line => {
      const levelKey = approvalLevelKey(line.approvalLevelRequired);
      return {
        id:       line.id,
        category: cat(line.categoryId),
        date:     formatDate(line.transactionDate),
        net:      this.currency.transform(line.netAmountLocal, line.currency ?? 'TND'),
        eur:      this.currency.transform(line.netAmountEur, 'EUR'),
        status: {
          label:   t(statusKey(line.status)),
          options: { variant: STATUS_BADGE_VARIANT[line.status] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,
        approval: {
          label:   levelKey ? t(levelKey) : '—',
          options: {
            variant: APPROVAL_BADGE_VARIANT[line.approvalLevelRequired ?? ''] ?? 'neutral',
            size: 'sm',
          },
        } satisfies BadgeCell,

        // Rendered by the projected cells above.
        _label:      line.label ?? '—',
        _reference:  line.reference ?? '',
        _canEdit:    canEdit(line),
        _canSubmit:  canSubmit(line),
        _raw:        line,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    hoverable:    true,
    loading:      this.loading(),
    skeletonRows: Math.min(this.pageSize(), 20),
    emptyMessage: this.emptyMessage(),
  }));

  protected onRowClick(row: TableRow): void {
    this.edit.emit(row['_raw'] as CostLineDto);
  }
}
