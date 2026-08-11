import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ApprovalItem, KIND_BADGE_VARIANT, kindKey } from './approval-item';
import { TableActionComponent } from '../../../shared/table-action.component';
import { URGENCY_BADGE_VARIANT, urgencyKey } from '../cost-display';
import { ApprovalDecision } from './approval-cards-section.component';

/**
 * List view of `/finance/cost/approval` on the house table style (UI-PLAYBOOK §6b),
 * over the same unified `ApprovalItem` the card view renders.
 *
 * Stateless: items in, `(decide)` out.
 */
@Component({
  selector: 'app-approval-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()">

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (row['_canAct']) {
            <fact-table-action icon="check_circle" [tooltip]="tips().approve"
                               (action)="emit(row, 'approve')" />
            @if (row['_kind'] === 'cost') {
              <fact-table-action icon="undo" [tooltip]="tips().complement"
                                 (action)="emit(row, 'return')" />
            } @else {
              <fact-table-action icon="open_in_new" [tooltip]="tips().candidate"
                                 (action)="emit(row, 'candidate')" />
            }
            <fact-table-action icon="block" variant="danger" [tooltip]="tips().reject"
                               (action)="emit(row, 'reject')" />
          }
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class ApprovalTableSectionComponent {
  private readonly translate = inject(TranslateService);

  items          = input.required<ApprovalItem[]>();
  loading        = input(false);
  emptyMessage   = input('');
  canApproveCost = input(false);

  readonly decide = output<{ item: ApprovalItem; decision: ApprovalDecision }>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      approve:    t('COST.APPROVAL_QUEUE.APPROVE_REQUEST'),
      complement: t('COST.APPROVAL_QUEUE.COMPLEMENT'),
      reject:     t('COST.APPROVAL_QUEUE.REJECT'),
      candidate:  t('COST.APPROVAL_QUEUE.VIEW_CANDIDATE'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'kind',      label: t('COST.APPROVAL_QUEUE.KIND'),         type: 'badge' },
      { key: 'title',     label: t('COST.LINES.COL_DESCRIPTION'),       type: 'text'  },
      { key: 'reference', label: t('COST.APPROVAL_QUEUE.REFERENCE'),    type: 'text'  },
      { key: 'date',      label: t('COST.APPROVAL_QUEUE.DATE'),         type: 'text'  },
      { key: 'amount',    label: t('COST.APPROVAL_QUEUE.AMOUNT_TOTAL'), type: 'text', align: 'right' },
      { key: 'priority',  label: t('COST.APPROVAL_QUEUE.PRIORITY'),     type: 'badge' },
      { key: '_actions',  label: '', align: 'right', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.items().map(item => ({
      id:        item.key,
      title:     item.title,
      reference: item.reference,
      date:      item.dateLabel,
      amount:    item.amountLabel,
      kind: {
        label:   t(kindKey(item.kind)),
        options: { variant: KIND_BADGE_VARIANT[item.kind], size: 'sm' },
      } satisfies BadgeCell,
      priority: {
        label:   item.kind === 'cost' ? t(urgencyKey(item.level)) : '—',
        options: { variant: URGENCY_BADGE_VARIANT[item.urgency], dot: true, size: 'sm' },
      } satisfies BadgeCell,

      _kind:   item.kind,
      _canAct: item.kind === 'hiring' || this.canApproveCost(),
      _item:   item,
    }));
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    // No rowClick: every action is a decision, so a row click would be ambiguous.
    hoverable:    false,
    loading:      this.loading(),
    skeletonRows: 6,
    emptyMessage: this.emptyMessage(),
  }));

  protected emit(row: TableRow, decision: ApprovalDecision): void {
    this.decide.emit({ item: row['_item'] as ApprovalItem, decision });
  }
}
