import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { ClientListItemDto } from '../client.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/**
 * Card view of `/finance/clients` — one `daf-entity-card` per client.
 *
 * Stateless: clients in, `(open)` out. The page owns the fetch, the filters and the
 * pagination (UI-PLAYBOOK §8b). Mirrors `app-affaires-cards-section` deliberately —
 * same grid, same skeleton, same empty state — so the two finance list pages read as
 * one family.
 */
@Component({
  selector: 'app-clients-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <!-- Same flat 3-column grid as app-affaires-cards-section — the two finance list
         pages must agree. NB: never write a backtick inside this template literal
         (UI-PLAYBOOK §10f) — it ends the string and the errors surface on the class
         members instead. -->
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
            <span class="material-symbols-outlined text-[40px] text-outline-variant">search_off</span>
            <p class="text-body-md">{{ emptyTitle() }}</p>
            <p class="text-body-md">{{ emptyDescription() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class ClientsCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  clients          = input.required<ClientListItemDto[]>();
  loading          = input(false);
  emptyTitle       = input('');
  emptyDescription = input('');
  /** Placeholder count while a re-fetch is in flight. */
  skeletonCount    = input(6);

  readonly open = output<number>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.clients().map(c => ({
      id: c.id,
      options: {
        variant: 'glass',
        clickable: true,
        image: { initials: initials(c.clientName) },
        metadata: {
          title:    c.clientName,
          subtitle: [c.clientCode, c.sector ?? c.country].filter(Boolean).join(' · '),
          // The card has ONE status slot and the client carries two flags, so the
          // exception wins (UI-PLAYBOOK §6): inactive beats KYC. An active client
          // then splits on KYC — validated (green) vs awaiting (warning).
          ...statusOf(c, t),
        },
        metricsColumns: 2,
        metrics: [
          { label: t('CLIENTS.LIST.CARD.TOTAL_CA'),        value: this.currency.transform(c.totalCA, c.defaultCurrency ?? 'TND') },
          { label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'), value: String(c.activeAffaireCount) },
          { label: t('CLIENTS.LIST.CARD.PAYMENT_TERMS'),   value: c.paymentTermsDays != null ? `${c.paymentTermsDays} j` : '—' },
          { label: t('CLIENTS.LIST.CARD.COUNTRY'),         value: c.country ?? '—' },
        ],
        viewLabel: t('CLIENTS.LIST.CARD.SEE_FILE'),
      } satisfies EntityCardOptions,
    }));
  });
}

/** Status slot + its precise label. Extracted so the mapping reads as one decision. */
function statusOf(
  c: ClientListItemDto,
  t: (key: string) => string,
): { status: 'active' | 'inactive' | 'pending'; statusLabel: string } {
  if (!c.isActive)  return { status: 'inactive', statusLabel: t('CLIENTS.LIST.CARD.INACTIVE') };
  if (c.isKycDone)  return { status: 'active',   statusLabel: t('CLIENTS.LIST.CARD.KYC_DONE') };
  return { status: 'pending', statusLabel: t('CLIENTS.LIST.CARD.KYC_PENDING') };
}

function initials(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('') || '—';
}
