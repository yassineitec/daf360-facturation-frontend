import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { CostInvoiceDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  STATUS_ENTITY_STATUS, approvalLevelKey, formatDate, initials, statusKey,
} from '../cost-display';
import {
  canEditInvoice, canReglementInvoice, canSubmitInvoice, invoiceCategorySummary,
} from './cost-invoice-display';

/**
 * Card view of the cost tab — one `daf-entity-card` per cost INVOICE (V93).
 *
 * Stateless: invoices in, the same outputs the table section exposes out, so neither
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
            (cardClick)="view.emit(card.raw)"
            (viewClick)="view.emit(card.raw)"
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

  invoices      = input.required<CostInvoiceDto[]>();
  loading       = input(false);
  emptyMessage  = input('');
  skeletonCount = input(6);

  /** Card click / "view" button — the read-only invoice detail page. Editing stays on the pencil action. */
  readonly view            = output<CostInvoiceDto>();
  readonly edit            = output<CostInvoiceDto>();
  readonly submitInvoice   = output<CostInvoiceDto>();
  readonly createReglement = output<CostInvoiceDto>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: CostInvoiceDto; options: EntityCardOptions }[]>(() => {
    const lang = this.translate.currentLang();
    const t  = (key: string) => this.translate.instant(key);
    const tp = (key: string, params?: Record<string, unknown>) => this.translate.instant(key, params);

    return this.invoices().map(inv => {
      const levelKey = approvalLevelKey(inv.approvalLevelRequired);
      const category = invoiceCategorySummary(inv, lang, tp);
      return {
        id:  inv.id,
        raw: inv,
        options: {
          variant: 'glass',
          clickable: true,
          image: { initials: initials(inv.supplierName) },
          metadata: {
            title:       inv.supplierName ?? t('COST.LINES.NO_SUPPLIER_CARD'),
            subtitle:    [inv.reference, inv.supplierInvoiceNumber, category !== '—' ? category : null]
                           .filter(Boolean).join(' · '),
            status:      STATUS_ENTITY_STATUS[inv.status] ?? 'pending',
            statusLabel: t(statusKey(inv.status)),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('COST.LINES.COL_TTC'),          value: this.currency.transform(inv.grossAmountLocal, inv.currency ?? 'TND') },
            { label: t('COST.LINES.COL_EUR'),          value: this.currency.transform(inv.grossAmountEur, 'EUR') },
            { label: t('COST.LINES.COL_INVOICE_DATE'), value: formatDate(inv.invoiceDate) },
            { label: t('COST.LINES.COL_LINES'),        value: String(inv.lines?.length ?? 0) },
            { label: t('COST.LINES.COL_NET_AMOUNT'),   value: this.currency.transform(inv.netAmountLocal, inv.currency ?? 'TND') },
            { label: t('COST.LINES.COL_APPROVAL'),     value: levelKey ? t(levelKey) : '—' },
          ],
          actions: this.actionsFor(inv, t),
          viewLabel: t('COST.LINES.VIEW'),
        } satisfies EntityCardOptions,
      };
    });
  });

  /** Same gates as the table's row actions — both read `cost-invoice-display.ts`. */
  private actionsFor(inv: CostInvoiceDto, t: (key: string) => string): EntityCardAction[] {
    const actions: EntityCardAction[] = [];
    if (canSubmitInvoice(inv))    actions.push({ id: 'submit',    icon: 'send',     tooltip: t('COST.LINES.SUBMIT') });
    if (canEditInvoice(inv))      actions.push({ id: 'edit',      icon: 'stylus',   tooltip: t('COST.LINES.EDIT')   });
    if (canReglementInvoice(inv)) actions.push({ id: 'reglement', icon: 'payments', tooltip: t('COST.LINES.CREATE_REGLEMENT') });
    return actions;
  }

  protected onAction(inv: CostInvoiceDto, id: string): void {
    if (id === 'submit')    this.submitInvoice.emit(inv);
    if (id === 'edit')      this.edit.emit(inv);
    if (id === 'reglement') this.createReglement.emit(inv);
  }
}
