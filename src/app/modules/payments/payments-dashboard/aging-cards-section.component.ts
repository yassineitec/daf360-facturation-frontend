import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { AgingRow } from '../payment.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { formatDate, initials, isLate, reminderLabel } from '../payments-display';

/**
 * Card view of `/finance/payments` — one `daf-entity-card` per unpaid invoice.
 *
 * Stateless: rows in, `(open)` out. Mirrors the affaires / clients / invoicing grids
 * so the finance list pages read as one family.
 */
@Component({
  selector: 'app-aging-cards-section',
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
            (cardClick)="open.emit(card.id)"
            (viewClick)="open.emit(card.id)" />
        } @empty {
          <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                      border border-dashed border-outline-variant/50 px-6 py-14
                      text-center text-on-surface-variant">
            <span class="material-symbols-outlined text-[40px] text-outline-variant">price_check</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class AgingCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  agingRows    = input.required<AgingRow[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Placeholder count while a re-fetch is in flight. */
  skeletonCount = input(6);

  /** Emits the invoice id. */
  readonly open = output<number>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    const lang = this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.agingRows().map(row => {
      const late = isLate(row);
      const reminder = reminderLabel(row, lang);
      return {
        id: row.invoiceId,
        options: {
          variant: 'glass',
          clickable: true,
          image: {
            initials: initials(row.clientNom),
            // Complete literal class (§3). The card has one status slot and no danger
            // look, so a red avatar tile is the only urgency cue available.
            badgeBg: late ? 'bg-danger' : undefined,
          },
          metadata: {
            title:    row.invoiceNumber ?? '—',
            subtitle: [row.clientNom, row.affaireRef].filter(Boolean).join(' · '),
            // Late reads as warning, on-time as green. The precision — how many days —
            // is a metric, since statusLabel is a single chip.
            status:      late ? 'pending' : 'active',
            statusLabel: late
              ? this.translate.instant('PAYMENTS.DASHBOARD.DAYS', { n: row.joursRetard })
              : t('PAYMENTS.DASHBOARD.CARD.ON_TIME'),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('PAYMENTS.DASHBOARD.TABLE.AMOUNT'),          value: this.currency.transform(row.montantTtc, row.devise) },
            { label: t('PAYMENTS.DASHBOARD.TABLE.DUE'),             value: formatDate(row.dateEcheance, lang) },
            { label: t('PAYMENTS.DASHBOARD.TABLE.REMINDER_STATUS'), value: reminder ?? '—' },
            { label: t('PAYMENTS.DASHBOARD.CARD.LAST_REMINDER'),    value: row.lastReminderSentAt ? formatDate(row.lastReminderSentAt, lang) : '—' },
          ],
          viewLabel: t('PAYMENTS.DASHBOARD.TABLE.VIEW'),
        } satisfies EntityCardOptions,
      };
    });
  });
}
