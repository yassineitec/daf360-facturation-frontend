import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { SupplierCostSummaryDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { initials } from '../cost-display';

/**
 * "By supplier" cards view of the Lignes de coût tab (2026-09-09 plan) — one
 * `daf-entity-card` per supplier with a cost-line count and running EUR total, plus one
 * "Sans fournisseur" pseudo-card (`supplierId: null`) for lines with no supplier
 * attached. No direct precedent to copy verbatim in this codebase; card styling
 * mirrors `cost-lines-cards-section.component.ts`, and the "group then render one card
 * per group, emit the group's id on click" shape mirrors
 * `wip-tm-detail-table.component.ts` (a table there, a card grid here — the
 * grouping/emit-id pattern is what's shared, not the rendering surface).
 *
 * Stateless: summaries in, a supplierId (or `null` for "Sans fournisseur") out on click.
 */
@Component({
  selector: 'app-cost-supplier-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="180px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card [options]="card.options" (cardClick)="open.emit(card.supplierId)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">store</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class CostSupplierCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  summaries     = input.required<SupplierCostSummaryDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  skeletonCount = input(6);

  readonly open = output<number | null>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; supplierId: number | null; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.summaries().map(s => {
      const name = s.supplierName ?? t('COST.LINES.NO_SUPPLIER_CARD');
      return {
        // `-1` as the tracking id for the "Sans fournisseur" row -- never shown, real
        // supplier ids are always positive, so this can never collide with one.
        id:         s.supplierId ?? -1,
        supplierId: s.supplierId,
        options: {
          variant: 'glass',
          clickable: true,
          image: { initials: initials(name) },
          metadata: {
            title:    name,
            subtitle: s.supplierCode ?? '—',
          },
          metricsColumns: 2,
          metrics: [
            { label: t('COST.LINES.SUPPLIER_CARD_COUNT'), value: String(s.lineCount) },
            // TTC, not HT: the cost-lines table shows Montant TTC per line and the
            // approval tier resolves from the TTC EUR amount (V82), so an HT total
            // here read as "what we spent with this supplier" next to TTC rows.
            { label: t('COST.LINES.SUPPLIER_CARD_TOTAL'), value: this.currency.transform(s.totalGrossEur, 'EUR') },
          ],
        } satisfies EntityCardOptions,
      };
    });
  });
}
