import { ChangeDetectionStrategy, Component, computed, inject, input, output, viewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ApprovalItem, KIND_BADGE_VARIANT, kindKey } from './approval-item';
import { TableActionComponent } from '../../../shared/table-action.component';
import { URGENCY_BADGE_VARIANT, urgencyKey } from '../cost-display';
import { ApprovalDecision } from './approval-cards-section.component';
import { tableTools } from '../../../shared/table-tools';

/** Rang de tri d'une priorité : de la moins à la plus pressante. */
const URGENCY_RANK: Record<string, number> = { low: 0, normal: 1, urgent: 2 };

/**
 * List view of `/finance/cost/approval` on the house table style (UI-PLAYBOOK §6b),
 * over the same unified `ApprovalItem` the card view renders.
 *
 * Outils de tableau de la lib activés, comme sur `/finance/affaires` (`tableTools`). Le tri
 * est local : chaque file arrive entière en un appel, la lib trie donc bien tout le
 * résultat, sur les valeurs brutes (`sortAccessor`) plutôt que sur les libellés formatés.
 * Les montants se comparent tels quels, sans conversion entre devises.
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
          @if (row['_kind'] === 'cost') {
            <fact-table-action icon="visibility" [tooltip]="tips().view"
                               (action)="emit(row, 'view')" />
          }
          @if (row['_kind'] === 'advance') {
            <fact-table-action icon="check_circle" [tooltip]="tips().approve"
                               (action)="emit(row, 'approve')" />
            <fact-table-action icon="block" variant="danger" [tooltip]="tips().reject"
                               (action)="emit(row, 'reject')" />
          } @else if (row['_canAct']) {
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

  /** Le tableau rendu — la page le passe à `daf-search-toolbar` (`[table]`) pour placer
   *  réinitialiser + choix des colonnes à droite de Filtres, au lieu d'au-dessus de la carte. */
  readonly table = viewChild(DataTableComponent);

  items          = input.required<ApprovalItem[]>();
  loading        = input(false);
  emptyMessage   = input('');
  canApproveCost = input(false);

  readonly decide = output<{ item: ApprovalItem; decision: ApprovalDecision }>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      view:       t('COST.APPROVAL_QUEUE.VIEW_DETAILS'),
      approve:    t('COST.APPROVAL_QUEUE.APPROVE_REQUEST'),
      complement: t('COST.APPROVAL_QUEUE.COMPLEMENT'),
      reject:     t('COST.APPROVAL_QUEUE.REJECT'),
      candidate:  t('COST.APPROVAL_QUEUE.VIEW_CANDIDATE'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const item = (row: TableRow) => row['_item'] as ApprovalItem;
    return [
      { key: 'kind',      label: t('COST.APPROVAL_QUEUE.KIND'),         type: 'badge', sortable: true },
      { key: 'title',     label: t('COST.LINES.COL_DESCRIPTION'),       type: 'text',  sortable: true,
        sortAccessor: row => item(row).title.toLowerCase() },
      { key: 'reference', label: t('COST.APPROVAL_QUEUE.REFERENCE'),    type: 'text',  sortable: true },
      { key: 'date',      label: t('COST.APPROVAL_QUEUE.DATE'),         type: 'text',  sortable: true,
        sortAccessor: row => item(row).sortDate },
      { key: 'amount',    label: t('COST.APPROVAL_QUEUE.AMOUNT_TOTAL'), type: 'text',  sortable: true,
        sortAccessor: row => item(row).sortAmount },
      { key: 'priority',  label: t('COST.APPROVAL_QUEUE.PRIORITY'),     type: 'badge', sortable: true,
        sortAccessor: row => URGENCY_RANK[item(row).urgency] },
      { key: '_actions',  label: '', width: '1%' },
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
        label:   item.kind === 'cost' ? t(urgencyKey(item.level))
               : item.kind === 'advance' ? t(`FACTURATION.ADVANCES.STATUS.${item.advance!.status}`)
               : '—',
        options: { variant: URGENCY_BADGE_VARIANT[item.urgency], dot: true, size: 'sm' },
      } satisfies BadgeCell,

      _kind:   item.kind,
      _canAct: item.kind === 'hiring' || this.canApproveCost(),
      _item:   item,
    }));
  });

  protected readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      // No rowClick: every action is a decision, so a row click would be ambiguous.
      hoverable:    false,
      loading:      this.loading(),
      skeletonRows: 6,
      emptyMessage: this.emptyMessage(),
      ...tableTools(this.translate),
    };
  });

  protected emit(row: TableRow, decision: ApprovalDecision): void {
    this.decide.emit({ item: row['_item'] as ApprovalItem, decision });
  }
}
