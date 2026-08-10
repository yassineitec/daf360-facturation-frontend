import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  STATUS_ENTITY_STATUS, approvalLevelKey, canEdit, canSubmit, formatDate, initials, statusKey,
} from '../cost-display';

/**
 * Card view of the Lignes de coût tab — one `daf-entity-card` per line.
 *
 * Stateless: lines in, the same two outputs the table section exposes out, so neither
 * view can offer an action the other doesn't.
 */
@Component({
  selector: 'app-cost-lines-cards-section',
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
            (cardClick)="edit.emit(card.raw)"
            (viewClick)="edit.emit(card.raw)"
            (actionClick)="onAction(card.raw, $event.id)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">receipt_long</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class CostLinesCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  lines         = input.required<CostLineDto[]>();
  categoryFor   = input.required<(id: number | null) => string>();
  loading       = input(false);
  emptyMessage  = input('');
  skeletonCount = input(6);

  readonly edit       = output<CostLineDto>();
  readonly submitLine = output<CostLineDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: CostLineDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const cat = this.categoryFor();

    return this.lines().map(line => {
      const levelKey = approvalLevelKey(line.approvalLevelRequired);
      return {
        id:  line.id,
        raw: line,
        options: {
          variant: 'glass',
          clickable: true,
          image: { initials: initials(line.label) },
          metadata: {
            title:       line.label ?? '—',
            subtitle:    [line.reference, cat(line.categoryId)].filter(Boolean).join(' · '),
            status:      STATUS_ENTITY_STATUS[line.status] ?? 'pending',
            statusLabel: t(statusKey(line.status)),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('COST.LINES.COL_NET_AMOUNT'), value: this.currency.transform(line.netAmountLocal, line.currency ?? 'TND') },
            { label: t('COST.LINES.COL_EUR'),        value: this.currency.transform(line.netAmountEur, 'EUR') },
            { label: t('COST.LINES.COL_DATE'),       value: formatDate(line.transactionDate) },
            { label: t('COST.LINES.COL_APPROVAL'),   value: levelKey ? t(levelKey) : '—' },
          ],
          actions: this.actionsFor(line, t),
          viewLabel: t('COST.LINES.EDIT'),
        } satisfies EntityCardOptions,
      };
    });
  });

  /** Same gates as the table's row actions — both read `cost-display.ts`. */
  private actionsFor(line: CostLineDto, t: (key: string) => string): EntityCardAction[] {
    const actions: EntityCardAction[] = [];
    if (canSubmit(line)) actions.push({ id: 'submit', icon: 'send',   tooltip: t('COST.LINES.SUBMIT') });
    if (canEdit(line))   actions.push({ id: 'edit',   icon: 'stylus', tooltip: t('COST.LINES.EDIT')   });
    return actions;
  }

  protected onAction(line: CostLineDto, id: string): void {
    if (id === 'submit') this.submitLine.emit(line);
    if (id === 'edit')   this.edit.emit(line);
  }
}
