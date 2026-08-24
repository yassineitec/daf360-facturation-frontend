import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';

import { initials } from '../../cost-display';
import {
  MissionApprovalItem, missionUrgencyKey,
} from '../mission-approval-item';

/** The three things finance can do with a mission. */
export type MissionDecisionKind = 'approve' | 'reject' | 'detail';

/**
 * Card view of `/finance/cost/missions` — one `daf-entity-card` per mission awaiting the
 * finance decision.
 *
 * Same shape, same grid and the same mapping rules as `app-approval-cards-section` on the
 * cost-approval queue, so the two finance approval screens read as one screen with two
 * feeds. Stateless: items in, `(decide)` out — the page owns the modals and the calls.
 */
@Component({
  selector: 'app-mission-approval-cards-section',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as the other finance card sections. NB: never write a
         backtick inside this template literal (UI-PLAYBOOK §10f). -->
    <div class="grid grid-cols-3 gap-6">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="268px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (actionClick)="decide.emit({ item: card.item, decision: $any($event.id) })" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">flight_takeoff</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class MissionApprovalCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  readonly items         = input.required<MissionApprovalItem[]>();
  readonly loading       = input(false);
  readonly emptyMessage  = input('');
  readonly skeletonCount = input(6);

  readonly decide = output<{ item: MissionApprovalItem; decision: MissionDecisionKind }>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i));

  protected readonly cards = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.items().map(item => ({
      id: item.id,
      item,
      options: {
        variant: 'glass',
        // Not clickable: every affordance is a decision, so a whole-card click would be
        // ambiguous about which one it means.
        clickable: false,
        image: {
          initials: initials(item.employee),
          // Complete literal class (§3) — a mission leaving in three days is the urgent one.
          badgeBg: item.urgency === 'urgent' ? 'bg-danger' : undefined,
        },
        metadata: {
          title: item.employee,
          // The subject leads: finance is deciding on a trip, not on a person.
          subtitle: `${item.title} · ${item.destination}`,
          status: item.urgency === 'normal' ? 'active' : 'pending',
          statusLabel: t(missionUrgencyKey(item.urgency)),
        },
        metricsColumns: 2,
        metrics: item.metrics,
        actions: this.actionsFor(t),
      } satisfies EntityCardOptions,
    }));
  });

  private actionsFor(t: (key: string) => string): EntityCardAction[] {
    return [
      { id: 'detail',  icon: 'visibility',   tooltip: t('FACTURATION.MISSIONS.DETAIL') },
      { id: 'approve', icon: 'check_circle', tooltip: t('FACTURATION.MISSIONS.APPROVE') },
      { id: 'reject',  icon: 'block',        tooltip: t('FACTURATION.MISSIONS.REJECT'), variant: 'danger' },
    ];
  }
}
