import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent, ProgressBarComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { OSTDto } from '../subcontracting.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import {
  OST_BADGE_VARIANT, budgetPct, budgetVariant, initials, isOver, ostStatutKey,
} from '../subcontracting-display';

/**
 * List view of the Ordres ST tab on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, icon-only row
 * actions in a trailing right-aligned column.
 *
 * Stateless: orders in, one output per action out.
 */
@Component({
  selector: 'app-ost-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, ProgressBarComponent, TableActionComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)">

      <!-- Consumption is a bar, not a number: the old table drew its own div pair with
           a hand-computed width and three raw hex fills. -->
      <ng-template dafCell="consumption" let-row>
        <div class="flex min-w-[140px] flex-col gap-1">
          <daf-progress-bar
            [value]="row['_pct']"
            [options]="{ variant: row['_barVariant'], size: 'xs', showLabel: false, showPercent: false }" />
          <span class="text-[11px] font-bold"
                [class]="row['_over'] ? 'text-danger' : 'text-on-surface-variant'">
            {{ row['_pctLabel'] }}
          </span>
        </div>
      </ng-template>

      <!-- Conditional per row and permission-gated, so it cannot be config.actions:
           TableAction has no row predicate (§6b rule 4). -->
      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (canManage()) {
            <fact-table-action id="edit" [tooltip]="tips().edit" (action)="edit.emit(row['_raw'])" />
            <fact-table-action icon="swap_horiz" [tooltip]="tips().status"
                               (action)="changeStatus.emit(row['_raw'])" />
          }
          <fact-table-action icon="download" [tooltip]="tips().csv"
                             [loading]="exportingId() === row['id']"
                             (action)="exportCsv.emit(row['_raw'])" />
          <fact-table-action icon="payments" [tooltip]="tips().costs"
                             (action)="costs.emit(row['_raw'])" />
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class OstTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  ordres       = input.required<OSTDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  canManage    = input(false);
  exportingId  = input<number | null>(null);

  readonly costs        = output<OSTDto>();
  readonly edit         = output<OSTDto>();
  readonly changeStatus = output<OSTDto>();
  readonly exportCsv    = output<OSTDto>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      edit:   t('SUBCONTRACTING.OST.EDIT'),
      status: t('SUBCONTRACTING.OST.STATUS_BTN'),
      csv:    t('SUBCONTRACTING.OST.CSV'),
      costs:  t('SUBCONTRACTING.OST.COSTS'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'reference',   label: t('SUBCONTRACTING.OST.TABLE.REF'),        type: 'text'   },
      { key: 'subcontractor', label: t('SUBCONTRACTING.OST.TABLE.ST'),       type: 'avatar' },
      { key: 'budget',      label: t('SUBCONTRACTING.OST.BUDGET'),           type: 'text', align: 'right' },
      { key: 'realized',    label: t('SUBCONTRACTING.OST.REALIZED'),         type: 'text', align: 'right' },
      { key: 'consumption', label: t('SUBCONTRACTING.OST.CARD.CONSUMED'),    type: 'custom' },
      { key: 'statut',      label: t('SUBCONTRACTING.OST.TABLE.STATUS'),     type: 'badge'  },
      { key: '_actions',    label: '', align: 'right', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.ordres().map(o => {
      const pct = budgetPct(o);
      return {
        id:        o.id,
        reference: o.referenceOst,
        subcontractor: {
          name:     o.sousTraitantName,
          initials: initials(o.sousTraitantName),
          subtitle: o.perimetre || undefined,
        } satisfies AvatarCell,
        budget:   this.currency.transform(o.montantBudget, o.devise),
        realized: this.currency.transform(o.montantRealise, o.devise),
        statut: {
          label:   t(ostStatutKey(o.statut)),
          options: { variant: OST_BADGE_VARIANT[o.statut] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,

        // Rendered by the projected consumption cell above.
        _pct:        pct,
        _pctLabel:   `${Math.round(pct)} %`,
        _barVariant: budgetVariant(o),
        _over:       isOver(o),
        _raw:        o,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    hoverable:    true,
    loading:      this.loading(),
    skeletonRows: 6,
    emptyMessage: this.emptyMessage(),
  }));

  /** A row click opens the costs drawer — the same thing the payments action does. */
  protected onRowClick(row: TableRow): void {
    this.costs.emit(row['_raw'] as OSTDto);
  }
}
