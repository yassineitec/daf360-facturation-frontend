import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';

import { TableActionComponent } from '../../../../shared/table-action.component';
import { initials } from '../../cost-display';
import {
  MISSION_SCOPE_VARIANT, MISSION_URGENCY_VARIANT, MissionApprovalItem,
  missionScopeKey, missionUrgencyKey,
} from '../mission-approval-item';
import { MissionDecisionKind } from './mission-approval-cards-section.component';

/**
 * List view of `/finance/cost/missions` on the house table style (§6b), over the same
 * `MissionApprovalItem` the card view renders.
 *
 * No `rowClick`: every action is a decision, so a row click would be ambiguous — the same
 * call the cost-approval table next door makes.
 */
@Component({
  selector: 'app-mission-approval-table-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  host: { class: 'block' },
  template: `
    <daf-data-table [columns]="columns()" [rows]="rows()" [config]="config()">

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          <fact-table-action icon="visibility" [tooltip]="tips().detail"
                             (action)="emit(row, 'detail')" />
          <fact-table-action icon="check_circle" [tooltip]="tips().approve"
                             (action)="emit(row, 'approve')" />
          <fact-table-action icon="block" variant="danger" [tooltip]="tips().reject"
                             (action)="emit(row, 'reject')" />
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class MissionApprovalTableSectionComponent {
  private readonly translate = inject(TranslateService);

  readonly items        = input.required<MissionApprovalItem[]>();
  readonly loading      = input(false);
  readonly emptyMessage = input('');
  readonly skeletonRows = input(6);

  readonly decide = output<{ item: MissionApprovalItem; decision: MissionDecisionKind }>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      detail:  t('FACTURATION.MISSIONS.DETAIL'),
      approve: t('FACTURATION.MISSIONS.APPROVE'),
      reject:  t('FACTURATION.MISSIONS.REJECT'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'employee',    label: t('FACTURATION.MISSIONS.COL_EMPLOYEE'), type: 'avatar' },
      { key: 'scope',       label: t('FACTURATION.MISSIONS.SCOPE'), type: 'badge' },
      { key: 'destination', label: t('FACTURATION.MISSIONS.COL_DESTINATION') },
      { key: 'period',      label: t('FACTURATION.MISSIONS.COL_PERIOD') },
      { key: 'validatedBy', label: t('FACTURATION.MISSIONS.COL_HR') },
      { key: 'amount',      label: t('FACTURATION.MISSIONS.COL_TOTAL'), align: 'right' },
      { key: 'urgency',     label: t('FACTURATION.MISSIONS.COL_URGENCY'), type: 'badge' },
      { key: '_actions',    label: '', align: 'right', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.items().map(item => ({
      // §6b rule 6: one identity column carrying the secondary line.
      employee: {
        name: item.employee,
        initials: initials(item.employee),
        subtitle: item.title,
      },
      scope: {
        label: t(missionScopeKey(item.scope)),
        options: { variant: MISSION_SCOPE_VARIANT[item.scope], size: 'sm' },
      } satisfies BadgeCell,
      destination: item.destination,
      period: item.periodLabel,
      validatedBy: item.validatedBy,
      amount: item.amountLabel,
      urgency: {
        label: t(missionUrgencyKey(item.urgency)),
        options: { variant: MISSION_URGENCY_VARIANT[item.urgency], dot: true, size: 'sm' },
      } satisfies BadgeCell,
      _item: item,
    }));
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable: false,
    loading: this.loading(),
    skeletonRows: Math.min(this.skeletonRows(), 20),
    emptyMessage: this.emptyMessage(),
  }));

  protected emit(row: TableRow, decision: MissionDecisionKind): void {
    this.decide.emit({ item: row['_item'] as MissionApprovalItem, decision });
  }
}
