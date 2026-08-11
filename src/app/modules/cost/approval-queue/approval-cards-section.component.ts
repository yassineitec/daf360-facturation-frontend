import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { ApprovalItem, kindKey } from './approval-item';
import { initials, urgencyKey } from '../cost-display';

/** One decision the queue can emit, for either kind of request. */
export type ApprovalDecision = 'approve' | 'return' | 'reject' | 'candidate';

/**
 * Card view of `/finance/cost/approval` — one `daf-entity-card` per pending request,
 * cost lines and hiring requests in the same grid.
 *
 * Stateless: items in, `(decide)` out.
 */
@Component({
  selector: 'app-approval-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as the other finance card sections. NB: never write a
         backtick inside this template literal (UI-PLAYBOOK §10f). -->
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="268px" />
        }
      } @else {
        @for (card of cards(); track card.key) {
          <daf-entity-card
            [options]="card.options"
            (actionClick)="decide.emit({ item: card.item, decision: $any($event.id) })" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">pending_actions</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class ApprovalCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  items         = input.required<ApprovalItem[]>();
  loading       = input(false);
  emptyMessage  = input('');
  canApproveCost = input(false);
  skeletonCount = input(6);

  readonly decide = output<{ item: ApprovalItem; decision: ApprovalDecision }>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ key: string; item: ApprovalItem; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.items().map(item => ({
      key:  item.key,
      item,
      options: {
        variant: 'glass',
        // Not clickable: every affordance here is a decision, so a whole-card click
        // would be ambiguous.
        clickable: false,
        image: {
          initials: initials(item.title),
          // Complete literal class (§3) — an L3/L4 cost line is the urgent one.
          badgeBg: item.urgency === 'urgent' ? 'bg-danger' : undefined,
        },
        metadata: {
          title:    item.title,
          // The kind is what tells the two queues apart at a glance, so it leads.
          subtitle: `${t(kindKey(item.kind))} · ${item.reference}`,
          status:      item.urgency === 'urgent' ? 'pending' : 'active',
          statusLabel: item.kind === 'cost'
            ? t(urgencyKey(item.level))
            : t('COST.APPROVAL_QUEUE.KIND_HIRING'),
        },
        metricsColumns: 2,
        metrics: item.metrics,
        actions: this.actionsFor(item, t),
      } satisfies EntityCardOptions,
    }));
  });

  private actionsFor(item: ApprovalItem, t: (key: string) => string): EntityCardAction[] {
    const actions: EntityCardAction[] = [];

    // Cost approval is permission-gated; the hiring queue has no equivalent code today.
    if (item.kind === 'cost' && !this.canApproveCost()) return actions;

    actions.push({ id: 'approve', icon: 'check_circle', tooltip: t('COST.APPROVAL_QUEUE.APPROVE_REQUEST') });

    if (item.kind === 'cost') {
      // "Complément" = send it back for more information. It used to call the *approve*
      // handler, so pressing it approved the line outright.
      actions.push({ id: 'return', icon: 'undo', tooltip: t('COST.APPROVAL_QUEUE.COMPLEMENT') });
    } else {
      actions.push({ id: 'candidate', icon: 'open_in_new', tooltip: t('COST.APPROVAL_QUEUE.VIEW_CANDIDATE') });
    }

    actions.push({ id: 'reject', icon: 'block', tooltip: t('COST.APPROVAL_QUEUE.REJECT'), variant: 'danger' });
    return actions;
  }
}
