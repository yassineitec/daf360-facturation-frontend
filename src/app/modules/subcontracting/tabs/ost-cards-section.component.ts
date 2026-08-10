import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { OSTDto } from '../subcontracting.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  OST_ENTITY_STATUS, budgetPct, initials, isOver, ostStatutKey,
} from '../subcontracting-display';

/**
 * Card view of the Ordres ST tab — one `daf-entity-card` per order.
 *
 * Stateless: orders in, one output per action out — the same four the table section
 * exposes, so neither view can offer an action the other doesn't.
 */
@Component({
  selector: 'app-ost-cards-section',
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
          <daf-skeleton variant="block" radius="xl" width="100%" height="248px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (cardClick)="costs.emit(card.raw)"
            (viewClick)="costs.emit(card.raw)"
            (actionClick)="onAction(card.raw, $event.id)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">assignment</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class OstCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  ordres        = input.required<OSTDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  canManage     = input(false);
  exportingId   = input<number | null>(null);
  skeletonCount = input(6);

  readonly costs        = output<OSTDto>();
  readonly edit         = output<OSTDto>();
  readonly changeStatus = output<OSTDto>();
  readonly exportCsv    = output<OSTDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: OSTDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.ordres().map(o => {
      const over = isOver(o);
      return {
        id:  o.id,
        raw: o,
        options: {
          variant: 'glass',
          clickable: true,
          image: {
            initials: initials(o.sousTraitantName),
            // Complete literal class (§3). A budget overrun is the one urgency this
            // card can carry — it has a single status slot and no danger look.
            badgeBg: over ? 'bg-danger' : undefined,
          },
          metadata: {
            title:       o.referenceOst,
            subtitle:    [o.sousTraitantName, o.perimetre].filter(Boolean).join(' · '),
            status:      OST_ENTITY_STATUS[o.statut] ?? 'active',
            statusLabel: t(ostStatutKey(o.statut)),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('SUBCONTRACTING.OST.BUDGET'),   value: this.currency.transform(o.montantBudget, o.devise) },
            { label: t('SUBCONTRACTING.OST.REALIZED'), value: this.currency.transform(o.montantRealise, o.devise) },
            { label: t('SUBCONTRACTING.OST.CARD.CONSUMED'), value: `${Math.round(budgetPct(o))} %` },
            over
              ? { label: t('SUBCONTRACTING.OST.CARD.ALERT'), value: t('SUBCONTRACTING.OST.OVERRUN_PLAIN') }
              : { label: t('SUBCONTRACTING.OST.CARD.THRESHOLD'), value: `${o.alerteDepassementPct} %` },
          ],
          actions: this.actionsFor(o, t),
          viewLabel: t('SUBCONTRACTING.OST.COSTS'),
        } satisfies EntityCardOptions,
      };
    });
  });

  private actionsFor(o: OSTDto, t: (key: string) => string): EntityCardAction[] {
    const actions: EntityCardAction[] = [];
    if (this.canManage()) {
      actions.push({ id: 'edit',   icon: 'stylus',       tooltip: t('SUBCONTRACTING.OST.EDIT')       });
      actions.push({ id: 'status', icon: 'swap_horiz',   tooltip: t('SUBCONTRACTING.OST.STATUS_BTN') });
    }
    actions.push({
      id: 'export',
      icon: this.exportingId() === o.id ? 'progress_activity' : 'download',
      tooltip: t('SUBCONTRACTING.OST.CSV'),
    });
    return actions;
  }

  protected onAction(o: OSTDto, id: string): void {
    switch (id) {
      case 'edit':   this.edit.emit(o);         break;
      case 'status': this.changeStatus.emit(o); break;
      case 'export': this.exportCsv.emit(o);    break;
    }
  }
}
