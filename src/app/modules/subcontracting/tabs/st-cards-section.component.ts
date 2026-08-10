import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { SousTraitantDto } from '../subcontracting.model';
import { initials } from '../subcontracting-display';

/**
 * Card view of the Sous-traitants tab — one `daf-entity-card` per subcontractor.
 *
 * Stateless: list in, `(edit)` / `(deactivate)` out. The tab owns the requests and the
 * modals. `canManage` gates the two actions the same way the table section does, so the
 * two views can never disagree about what a user may do.
 */
@Component({
  selector: 'app-st-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
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
            <span class="material-symbols-outlined text-[40px] text-outline-variant">group_off</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class StCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  list          = input.required<SousTraitantDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  canManage     = input(false);
  skeletonCount = input(6);

  readonly edit       = output<SousTraitantDto>();
  readonly deactivate = output<SousTraitantDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: SousTraitantDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.list().map(st => ({
      id:  st.id,
      raw: st,
      options: {
        variant: 'glass',
        // Not clickable: a subcontractor has no detail page — the card's actions are
        // the only thing to do with it, so a whole-card click would go nowhere.
        clickable: false,
        image: { initials: initials(st.name) },
        metadata: {
          title:       st.name,
          subtitle:    st.country ?? '—',
          status:      st.isActive ? 'active' : 'inactive',
          statusLabel: t(st.isActive ? 'SUBCONTRACTING.ST.ACTIVE' : 'SUBCONTRACTING.ST.INACTIVE'),
        },
        metricsColumns: 2,
        metrics: [
          { label: t('SUBCONTRACTING.ST.TABLE.EMAIL'),  value: st.contactEmail ?? '—' },
          { label: t('SUBCONTRACTING.ST.TABLE.PHONE'),  value: st.contactPhone ?? '—' },
          { label: t('SUBCONTRACTING.ST.TABLE.TAX_ID'), value: st.taxId ?? '—' },
          { label: t('SUBCONTRACTING.ST.TABLE.COUNTRY'), value: st.country ?? '—' },
        ],
        actions: this.actionsFor(st, t),
      } satisfies EntityCardOptions,
    }));
  });

  private actionsFor(st: SousTraitantDto, t: (key: string) => string): EntityCardAction[] {
    if (!this.canManage()) return [];
    const actions: EntityCardAction[] = [
      { id: 'edit', icon: 'stylus', tooltip: t('SUBCONTRACTING.ST.EDIT') },
    ];
    // Deactivation is only meaningful on an active subcontractor.
    if (st.isActive) {
      actions.push({ id: 'deactivate', icon: 'delete', tooltip: t('SUBCONTRACTING.ST.DEACTIVATE'), variant: 'danger' });
    }
    return actions;
  }

  protected onAction(st: SousTraitantDto, id: string): void {
    if (id === 'edit')       this.edit.emit(st);
    if (id === 'deactivate') this.deactivate.emit(st);
  }
}
