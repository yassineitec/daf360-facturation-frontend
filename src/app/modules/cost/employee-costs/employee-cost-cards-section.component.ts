import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { EmployeeCostDto } from './employee-cost.model';
import {
  STATUS_ENTITY_STATUS, displayName, formatAmount, formatPeriod, initials, statusKey,
} from './employee-cost-display';

/**
 * Card view of the Coûts collaborateurs screen — one `daf-entity-card` per row, same
 * flat 3-column grid as the other finance card sections (../tabs/cost-lines-cards-
 * section.component.ts).
 *
 * Stateless: rows in, the same two outputs the table section exposes out, so neither
 * view can offer an action the other doesn't.
 */
@Component({
  selector: 'app-employee-cost-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="212px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (cardClick)="history.emit(card.raw)"
            (viewClick)="history.emit(card.raw)"
            (actionClick)="onAction(card.raw, $event.id)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">badge</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class EmployeeCostCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  costs         = input.required<EmployeeCostDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  skeletonCount = input(6);

  readonly edit    = output<EmployeeCostDto>();
  readonly remove  = output<EmployeeCostDto>();
  readonly history = output<EmployeeCostDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: EmployeeCostDto; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.costs().map(row => {
      const name = displayName(row);
      return {
        id:  row.id,
        raw: row,
        options: {
          variant: 'glass',
          clickable: true,
          image: { initials: initials(name) },
          metadata: {
            title:       name,
            // Only shown once it's not simply repeating the title above it — same rule
            // as the table section's avatar cell.
            subtitle:    row.fullName?.trim() ? row.employeeEmail : undefined,
            status:      row.sourceStatus ? STATUS_ENTITY_STATUS[row.sourceStatus] : 'inactive',
            statusLabel: row.sourceStatus ? t(statusKey(row.sourceStatus)) : '—',
          },
          metricsColumns: 2,
          metrics: [
            { label: t('COST.EMPLOYEE_COST.COL_BASIC'),    value: formatAmount(row.basicCost, row.currency) },
            { label: t('COST.EMPLOYEE_COST.COL_INTERNAL'), value: formatAmount(row.internalSellingCost, row.currency) },
            { label: t('COST.EMPLOYEE_COST.COL_EXTERNAL'), value: formatAmount(row.externalSellingCost, row.currency) },
            { label: t('COST.EMPLOYEE_COST.COL_PERIOD'),   value: formatPeriod(row.dateDebut, row.dateFin) },
          ],
          actions: [
            { id: 'history', icon: 'history', tooltip: t('COST.EMPLOYEE_COST.HISTORY') },
            { id: 'edit',    icon: 'stylus',  tooltip: t('COST.EMPLOYEE_COST.EDIT') },
            { id: 'delete',  icon: 'delete',  tooltip: t('COST.EMPLOYEE_COST.DELETE'), variant: 'danger' },
          ],
          viewLabel: t('COST.EMPLOYEE_COST.HISTORY'),
        } satisfies EntityCardOptions,
      };
    });
  });

  protected onAction(row: EmployeeCostDto, id: string): void {
    if (id === 'delete')  this.remove.emit(row);
    if (id === 'edit')    this.edit.emit(row);
    if (id === 'history') this.history.emit(row);
  }
}
