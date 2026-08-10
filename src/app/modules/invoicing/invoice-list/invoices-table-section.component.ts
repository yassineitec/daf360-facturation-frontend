import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { INVOICE_STATUT_CONFIG, InvoiceListItem } from '../invoice.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import {
  STATUT_BADGE_VARIANT, canApprove, canEmit, canMarkSent, canRecordPayment,
  formatDate, initials, isOverdue, overdueDays,
} from '../invoice-display';

/**
 * List view of `/finance/invoicing` on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, and icon-only row
 * actions in a trailing right-aligned column.
 *
 * Stateless: invoices in, one output per action out. The page owns the requests and
 * the modals.
 */
@Component({
  selector: 'app-invoices-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)">

      <!-- Échéance carries the overdue signal: the old table put a separate "+N jours"
           tag next to the status badge, which a badge column cannot hold. -->
      <ng-template dafCell="date" let-row>
        <div class="flex flex-col leading-snug">
          <span [class]="row['_overdue'] ? 'text-danger font-bold' : ''">{{ row['_dateLabel'] }}</span>
          @if (row['_overdue']) {
            <span class="text-[11px] font-bold text-danger">{{ row['_overdueLabel'] }}</span>
          }
        </div>
      </ng-template>

      <!-- Conditional per row, so it cannot be config.actions: TableAction has no row
           predicate (§6b rule 4). -->
      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (row['_canApprove']) {
            <fact-table-action icon="fact_check" [tooltip]="tips().approve" (action)="approve.emit(row['_raw'])" />
          }
          @if (row['_canEmit']) {
            <fact-table-action icon="send" [tooltip]="tips().emit" (action)="emitInvoice.emit(row['_raw'])" />
          }
          @if (row['_canMarkSent']) {
            <fact-table-action icon="mark_email_read" [tooltip]="tips().markSent" (action)="markSent.emit(row['_raw'])" />
          }
          @if (row['_canPay']) {
            <fact-table-action icon="payments" [tooltip]="tips().payment" (action)="recordPayment.emit(row['_raw'])" />
          }
          <fact-table-action id="view" [tooltip]="tips().view" (action)="open.emit(row['id'])" />
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class InvoicesTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  invoices     = input.required<InvoiceListItem[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Current page size — the skeleton draws that many rows, capped at 20 (§6b rule 7). */
  pageSize     = input(20);

  readonly open          = output<number>();
  readonly approve       = output<InvoiceListItem>();
  readonly emitInvoice   = output<InvoiceListItem>();
  readonly markSent      = output<InvoiceListItem>();
  readonly recordPayment = output<InvoiceListItem>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return {
      view:     t('INVOICING.LIST.ACTIONS.VIEW'),
      approve:  t('INVOICING.LIST.ACTIONS.APPROVE'),
      emit:     t('INVOICING.LIST.ACTIONS.EMIT'),
      markSent: t('INVOICING.LIST.ACTIONS.MARK_SENT'),
      payment:  t('INVOICING.LIST.ACTIONS.PAYMENT'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'reference', label: t('INVOICING.LIST.TABLE.REF'),    type: 'text'   },
      { key: 'client',    label: t('INVOICING.LIST.TABLE.CLIENT'), type: 'avatar' },
      { key: 'amount',    label: t('INVOICING.LIST.TABLE.AMOUNT'), type: 'text', align: 'right' },
      { key: 'statut',    label: t('INVOICING.LIST.TABLE.STATUS'), type: 'badge'  },
      { key: 'date',      label: t('INVOICING.LIST.TABLE.DATE'),   type: 'custom' },
      // Never `clickable: true` on a projected actions column — that styles the cell as
      // a link rather than an action (§6b rule 4).
      { key: '_actions',  label: '', align: 'right', width: '1%' },
    ];
    // No column is `sortable`: the lib sorts client-side over the one page it was
    // handed, and this list is server-paginated (§10b).
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.invoices().map(inv => {
      const overdue = isOverdue(inv);
      return {
        id:        inv.id,
        reference: inv.invoiceNumber || t('INVOICING.LIST.TABLE.DRAFT'),
        client: {
          name:     inv.clientNom || '—',
          initials: initials(inv.clientNom),
          subtitle: inv.affaireRef ?? undefined,
        } satisfies AvatarCell,
        amount: this.currency.transform(inv.montantTtc, inv.devise),
        statut: {
          // Label key from INVOICE_STATUT_CONFIG, not an interpolated one: an unmapped
          // status then renders its raw code instead of a bare translation key.
          label:   t(INVOICE_STATUT_CONFIG[inv.statut]?.label ?? inv.statut),
          options: { variant: STATUT_BADGE_VARIANT[inv.statut] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,

        // Rendered by the projected cells below.
        _dateLabel: inv.dateEcheance
          ? `${t('INVOICING.LIST.TABLE.ECH_PREFIX')} ${formatDate(inv.dateEcheance)}`
          : formatDate(inv.dateEmission),
        _overdue:      overdue,
        _overdueLabel: overdue
          ? this.translate.instant('INVOICING.LIST.TABLE.OVERDUE_DAYS', { days: overdueDays(inv) })
          : '',
        _canApprove:  canApprove(inv),
        _canEmit:     canEmit(inv),
        _canMarkSent: canMarkSent(inv),
        _canPay:      canRecordPayment(inv),
        _raw:         inv,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => ({
    showHeader:   false,
    hoverable:    true,
    loading:      this.loading(),
    skeletonRows: Math.min(this.pageSize(), 20),
    emptyMessage: this.emptyMessage(),
  }));

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
