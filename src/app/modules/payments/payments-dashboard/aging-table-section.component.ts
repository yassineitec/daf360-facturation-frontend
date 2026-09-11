import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { AgingRow } from '../payment.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { formatDate, initials, reminderLabel, retardVariant } from '../payments-display';

/**
 * List view of `/finance/payments` on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, and one icon-only
 * row action in a trailing right-aligned column.
 *
 * Stateless: rows in, `(open)` out.
 */
@Component({
  selector: 'app-aging-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)">

      <ng-template dafCell="reminder" let-row>
        <div class="flex flex-col leading-snug">
          <span>{{ row['_reminderLabel'] }}</span>
          @if (row['_reminderDate']) {
            <span class="text-[11px] text-on-surface-variant">{{ row['_reminderDate'] }}</span>
          }
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class AgingTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  agingRows    = input.required<AgingRow[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Current page size — the skeleton draws that many rows, capped at 20 (§6b rule 7). */
  pageSize     = input(20);

  /** Emits the invoice id — a row and its view action both mean "open this invoice". */
  readonly open = output<number>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'client',     label: t('PAYMENTS.DASHBOARD.TABLE.CLIENT'),          type: 'avatar' },
      { key: 'invoice',    label: t('PAYMENTS.DASHBOARD.TABLE.INVOICE'),         type: 'text'   },
      { key: 'amount',     label: t('PAYMENTS.DASHBOARD.TABLE.AMOUNT'),          type: 'text', align: 'right' },
      { key: 'due',        label: t('PAYMENTS.DASHBOARD.TABLE.DUE'),             type: 'text'   },
      { key: 'daysLate',   label: t('PAYMENTS.DASHBOARD.TABLE.DAYS_LATE'),       type: 'badge'  },
      { key: 'reminder',   label: t('PAYMENTS.DASHBOARD.TABLE.REMINDER_STATUS'), type: 'custom' },
    ];
    // No column is `sortable`: the lib sorts client-side over the one page it was
    // handed, and this list is server-paginated (§10b).
  });

  protected readonly rows = computed<TableRow[]>(() => {
    const lang = this.translate.currentLang();

    return this.agingRows().map(row => {
      const reminder = reminderLabel(row, lang);
      return {
        id: row.invoiceId,
        client: {
          name:     row.clientNom || '—',
          initials: initials(row.clientNom),
          subtitle: row.affaireRef ?? undefined,
        } satisfies AvatarCell,
        invoice: row.invoiceNumber ?? '—',
        amount:  this.currency.transform(row.montantTtc, row.devise),
        due:     formatDate(row.dateEcheance, lang),
        daysLate: {
          // An on-time invoice still gets a badge rather than a bare dash, so the
          // column reads as one thing at a glance.
          label:   row.joursRetard > 0 ? this.translate.instant('PAYMENTS.DASHBOARD.DAYS', { n: row.joursRetard }) : '—',
          options: { variant: row.joursRetard > 0 ? retardVariant(row.joursRetard) : 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,

        // Rendered by the projected cell above.
        _reminderLabel: reminder ?? '—',
        _reminderDate:  row.lastReminderSentAt ? formatDate(row.lastReminderSentAt, lang) : '',
        _raw: row,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: Math.min(this.pageSize(), 20),
      emptyMessage: this.emptyMessage(),
      // Unconditional, so it belongs on config.actions rather than a projected cell —
      // the lib's actions cell already stops propagation (§6b rule 4).
      actions: [{
        id:      'view',
        tooltip: this.translate.instant('PAYMENTS.DASHBOARD.TABLE.VIEW'),
        onClick: (row: TableRow) => this.open.emit(row['id'] as number),
      }],
    };
  });

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
