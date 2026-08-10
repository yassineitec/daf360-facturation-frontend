import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  EntityCardAction, EntityCardComponent, EntityCardOptions, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { INVOICE_STATUT_CONFIG, InvoiceListItem } from '../invoice.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  STATUT_ENTITY_STATUS, canApprove, canEmit, canMarkSent, canRecordPayment,
  formatDate, initials, isOverdue, overdueDays,
} from '../invoice-display';

/**
 * Card view of `/finance/invoicing` — one `daf-entity-card` per invoice.
 *
 * Stateless: invoices in, one output per action out — the same five outputs the table
 * section exposes, so the page wires both views identically and neither can offer an
 * action the other doesn't.
 *
 * Unlike the affaires and clients grids, this one uses `options.actions`: an invoice's
 * quick actions are status-gated, and `EntityCardAction` (unlike `TableAction`) is
 * built per card, so the predicate lives in the same computed. They render in the
 * card's hover-revealed footer (§6).
 */
@Component({
  selector: 'app-invoices-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as the affaires and clients card sections — the finance
         list pages must agree. NB: never write a backtick inside this template literal
         (UI-PLAYBOOK §10f). -->
    <div class="grid grid-cols-3 gap-5">

      @if (loading()) {
        @for (i of skeletonSlots(); track i) {
          <daf-skeleton variant="block" radius="xl" width="100%" height="248px" />
        }
      } @else {
        @for (card of cards(); track card.id) {
          <daf-entity-card
            [options]="card.options"
            (cardClick)="open.emit(card.id)"
            (viewClick)="open.emit(card.id)"
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
export class InvoicesCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  invoices     = input.required<InvoiceListItem[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Placeholder count while a re-fetch is in flight. */
  skeletonCount = input(6);

  readonly open          = output<number>();
  readonly approve       = output<InvoiceListItem>();
  readonly emitInvoice   = output<InvoiceListItem>();
  readonly markSent      = output<InvoiceListItem>();
  readonly recordPayment = output<InvoiceListItem>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; raw: InvoiceListItem; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.invoices().map(inv => {
      const overdue = isOverdue(inv);
      return {
        id:  inv.id,
        raw: inv,
        options: {
          variant: 'glass',
          clickable: true,
          image: {
            initials: initials(inv.clientNom),
            // Complete literal class (§3). The card has one status slot and no danger
            // look, so a red avatar tile is the only urgency cue available — the same
            // trick /rh/it-provisioning uses for an overdue file.
            badgeBg: overdue ? 'bg-danger' : undefined,
          },
          metadata: {
            title:       inv.invoiceNumber || t('INVOICING.LIST.TABLE.DRAFT'),
            subtitle:    [inv.clientNom, inv.affaireRef].filter(Boolean).join(' · '),
            status:      STATUT_ENTITY_STATUS[inv.statut] ?? 'pending',
            statusLabel: t(INVOICE_STATUT_CONFIG[inv.statut]?.label ?? inv.statut),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('INVOICING.LIST.TABLE.AMOUNT'),   value: this.currency.transform(inv.montantTtc, inv.devise) },
            { label: t('INVOICING.LIST.CARD.HT'),        value: this.currency.transform(inv.montantHt, inv.devise) },
            { label: t('INVOICING.LIST.CARD.DUE_DATE'),  value: inv.dateEcheance ? formatDate(inv.dateEcheance) : formatDate(inv.dateEmission) },
            overdue
              // Swaps the type metric out for the delay, so an overdue card says so
              // twice — red tile and a labelled figure.
              ? { label: t('INVOICING.LIST.CARD.OVERDUE'), value: this.translate.instant('INVOICING.LIST.TABLE.OVERDUE_DAYS', { days: overdueDays(inv) }) }
              : { label: t('INVOICING.LIST.CARD.TYPE'),    value: inv.invoiceType ?? '—' },
          ],
          actions: this.actionsFor(inv, t),
          viewLabel: t('INVOICING.LIST.ACTIONS.VIEW'),
        } satisfies EntityCardOptions,
      };
    });
  });

  /** Same status gates as the table's row actions — both read `invoice-display.ts`. */
  private actionsFor(inv: InvoiceListItem, t: (key: string) => string): EntityCardAction[] {
    const actions: EntityCardAction[] = [];
    if (canApprove(inv))       actions.push({ id: 'approve',  icon: 'fact_check',       tooltip: t('INVOICING.LIST.ACTIONS.APPROVE')   });
    if (canEmit(inv))          actions.push({ id: 'emit',     icon: 'send',             tooltip: t('INVOICING.LIST.ACTIONS.EMIT')      });
    if (canMarkSent(inv))      actions.push({ id: 'markSent', icon: 'mark_email_read',  tooltip: t('INVOICING.LIST.ACTIONS.MARK_SENT') });
    if (canRecordPayment(inv)) actions.push({ id: 'payment',  icon: 'payments',         tooltip: t('INVOICING.LIST.ACTIONS.PAYMENT')   });
    return actions;
  }

  protected onAction(inv: InvoiceListItem, id: string): void {
    switch (id) {
      case 'approve':  this.approve.emit(inv);       break;
      case 'emit':     this.emitInvoice.emit(inv);   break;
      case 'markSent': this.markSent.emit(inv);      break;
      case 'payment':  this.recordPayment.emit(inv); break;
    }
  }
}
