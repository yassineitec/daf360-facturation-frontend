import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent, TableRow,
} from '@khalilrebhiitec/daf360';
import { PlPeriodDto, PlPeriodStatus } from './pl-reporting.model';

/** `daf-entity-card` status per period status — grey while open, amber in the close/submit
 *  workflow, green once approved. */
const PERIOD_ENTITY_STATUS: Record<PlPeriodStatus, string> = {
  OPEN:      'inactive',
  CLOSED:    'pending',
  SUBMITTED: 'pending',
  APPROVED:  'active',
};

/**
 * Card view of `/finance/reporting` — one `daf-entity-card` per P&L period, same as the
 * other finance card sections.
 *
 * Stateless: it takes the very rows the table view renders (`ReportingListComponent.rows()`,
 * already filtered, sorted and formatted) and hands every action back to the parent, which
 * owns the modals and the API calls. Close / generate are the table's row actions, with the
 * same gates (`_canClose` / `_canGenerate`).
 */
@Component({
  selector: 'app-pl-period-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as the other finance card sections. NB: never write a
         backtick inside this template literal (UI-PLAYBOOK §10f). -->
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots; track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="248px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (cardClick)="card.clickable && open.emit(card.row)"
            (viewClick)="open.emit(card.row)"
            (actionClick)="onAction($event.id, card.row)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">bar_chart</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class PlPeriodCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  periodRows   = input.required<TableRow[]>();
  loading      = input(false);
  emptyMessage = input('');

  /** Emits the row of a period that already has a report (same rule as the table's rowClick). */
  readonly open     = output<TableRow>();
  readonly close    = output<PlPeriodDto>();
  readonly generate = output<PlPeriodDto>();

  protected readonly skeletonSlots = [0, 1, 2, 3, 4, 5];

  protected readonly cards = computed<{ id: number; row: TableRow; clickable: boolean; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.periodRows().map(row => {
      const period = row['_period'] as PlPeriodDto;
      const report = row['_reportBadge'] as BadgeCell | null;
      const hasReport = row['_reportId'] != null;

      const actions: EntityCardAction[] = [];
      if (row['_canClose'])    actions.push({ id: 'close',    icon: 'lock',         tooltip: t('REPORTING.CLOSE_PERIOD_FULL') });
      if (row['_canGenerate']) actions.push({ id: 'generate', icon: 'auto_awesome', tooltip: t('REPORTING.GENERATE') });

      return {
        id:  period.id,
        row,
        clickable: hasReport,
        options: {
          variant:   'glass',
          clickable: hasReport,
          // Month number as the badge — the title already spells the month out. Red when
          // the month lost money.
          image: {
            initials: String(period.periodMonth).padStart(2, '0'),
            ...(row['_ebitdaNegative'] ? { badgeBg: 'bg-danger' } : {}),
          },
          metadata: {
            title:       row['period'] as string,
            subtitle:    report ? `${t('REPORTING.TABLE.REPORT')} : ${report.label}` : t('REPORTING.NO_REPORT'),
            status:      PERIOD_ENTITY_STATUS[period.status] ?? 'inactive',
            statusLabel: (row['periodStatus'] as BadgeCell).label,
          },
          metricsColumns: 3,
          metrics: [
            { label: t('REPORTING.TABLE.NET_REVENUE'), value: row['netRevenue'] as string },
            { label: t('REPORTING.TABLE.EBITDA'),      value: row['ebitda'] as string },
            { label: t('REPORTING.TABLE.EBITDA_PCT'),  value: row['ebitdaPct'] as string },
          ],
          actions,
          viewLabel: hasReport ? t('REPORTING.VIEW_REPORT') : undefined,
        } satisfies EntityCardOptions,
      };
    });
  });

  protected onAction(id: string, row: TableRow): void {
    const period = row['_period'] as PlPeriodDto;
    if (id === 'close') this.close.emit(period);
    else if (id === 'generate') this.generate.emit(period);
  }
}
