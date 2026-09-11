import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import {
  STATUS_BADGE_VARIANT, URGENCY_BADGE_VARIANT, formatDate, statusKey, urgency, urgencyKey,
} from '../cost-display';

/**
 * List view of the Approbations tab on the house table style (UI-PLAYBOOK §6b).
 *
 * Stateless: pending lines in, one output per decision out — the page owns the modal.
 */
@Component({
  selector: 'app-approval-queue-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()">

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          <fact-table-action icon="check_circle" [tooltip]="tips().approve"
                             (action)="approve.emit(row['_raw'])" />
          <fact-table-action icon="undo" [tooltip]="tips().return"
                             (action)="returnLine.emit(row['_raw'])" />
          <fact-table-action icon="cancel" variant="danger" [tooltip]="tips().reject"
                             (action)="reject.emit(row['_raw'])" />
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class ApprovalQueueTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  pending      = input.required<CostLineDto[]>();
  loading      = input(false);
  emptyMessage = input('');

  readonly approve    = output<CostLineDto>();
  readonly returnLine = output<CostLineDto>();
  readonly reject     = output<CostLineDto>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      approve: t('COST.QUEUE.APPROVE_REQUEST'),
      return:  t('COST.QUEUE.RETURN'),
      reject:  t('COST.QUEUE.REJECT_TITLE'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'label',    label: t('COST.LINES.COL_DESCRIPTION'), type: 'text'  },
      { key: 'date',     label: t('COST.QUEUE.DATE'),            type: 'text'  },
      { key: 'amount',   label: t('COST.QUEUE.AMOUNT_TOTAL'),    type: 'text', align: 'right' },
      { key: 'urgency',  label: t('COST.LINES.COL_APPROVAL'),    type: 'badge' },
      { key: 'status',   label: t('COST.QUEUE.STATUS'),          type: 'badge' },
      { key: '_actions', label: '', align: 'right', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.pending().map(line => ({
      id:     line.id,
      label:  line.label ?? '—',
      date:   formatDate(line.transactionDate),
      amount: this.currency.transform(line.netAmountLocal, line.currency ?? 'TND'),
      urgency: {
        label:   t(urgencyKey(line.approvalLevelRequired)),
        options: { variant: URGENCY_BADGE_VARIANT[urgency(line.approvalLevelRequired)], dot: true, size: 'sm' },
      } satisfies BadgeCell,
      status: {
        label:   t(statusKey(line.status)),
        options: { variant: STATUS_BADGE_VARIANT[line.status] ?? 'neutral', dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _raw: line,
    }));
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    // No rowClick: every action here is a decision, and picking one by clicking the row
    // would be ambiguous.
    hoverable:    false,
    loading:      this.loading(),
    skeletonRows: 6,
    emptyMessage: this.emptyMessage(),
  }));
}
