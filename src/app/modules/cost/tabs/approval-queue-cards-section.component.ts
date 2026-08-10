import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { formatDate, initials, statusKey, urgency, urgencyKey } from '../cost-display';

/**
 * Card view of the Approbations tab — one `daf-entity-card` per line awaiting a
 * decision. Same three outputs as the table section.
 */
@Component({
  selector: 'app-approval-queue-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as the other finance card sections. NB: never write a
         backtick inside this template literal (UI-PLAYBOOK §10f). -->
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="228px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (actionClick)="onAction(card.raw, $event.id)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">task_alt</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class ApprovalQueueCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  pending       = input.required<CostLineDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  skeletonCount = input(6);

  readonly approve    = output<CostLineDto>();
  readonly returnLine = output<CostLineDto>();
  readonly reject     = output<CostLineDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: CostLineDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.pending().map(line => {
      const level = urgency(line.approvalLevelRequired);
      return {
        id:  line.id,
        raw: line,
        options: {
          variant: 'glass',
          // Not clickable: every action is a decision, so a whole-card click would be
          // ambiguous. The three action icons are the only affordance.
          clickable: false,
          image: {
            initials: initials(line.label),
            // Complete literal class (§3) — an L3/L4 line is the urgent one.
            badgeBg: level === 'urgent' ? 'bg-danger' : undefined,
          },
          metadata: {
            title:       line.label ?? '—',
            subtitle:    line.reference ?? '—',
            // Urgent reads as warning, everything else as green; the exact level is the
            // label (§6).
            status:      level === 'urgent' ? 'pending' : 'active',
            statusLabel: t(urgencyKey(line.approvalLevelRequired)),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('COST.QUEUE.AMOUNT_TOTAL'), value: this.currency.transform(line.netAmountLocal, line.currency ?? 'TND') },
            { label: t('COST.QUEUE.DATE'),         value: formatDate(line.transactionDate) },
            { label: t('COST.QUEUE.STATUS'),       value: t(statusKey(line.status)) },
            { label: t('COST.LINES.COL_EUR'),      value: this.currency.transform(line.netAmountEur, 'EUR') },
          ],
          actions: this.actionsFor(t),
        } satisfies EntityCardOptions,
      };
    });
  });

  private actionsFor(t: (key: string) => string): EntityCardAction[] {
    return [
      { id: 'approve', icon: 'check_circle', tooltip: t('COST.QUEUE.APPROVE_REQUEST') },
      { id: 'return',  icon: 'undo',         tooltip: t('COST.QUEUE.RETURN')          },
      { id: 'reject',  icon: 'cancel',       tooltip: t('COST.QUEUE.REJECT_TITLE'), variant: 'danger' },
    ];
  }

  protected onAction(line: CostLineDto, id: string): void {
    if (id === 'approve') this.approve.emit(line);
    if (id === 'return')  this.returnLine.emit(line);
    if (id === 'reject')  this.reject.emit(line);
  }
}
