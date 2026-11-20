import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { ClientListItemDto } from '../client.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { CurrencyContextService } from '../../../core/currency-context.service';
// Les etats et leurs libelles viennent du meme fichier que ceux du tableau : les deux
// vues ne peuvent plus diverger (cf. client-display.ts).
import { CLIENT_STATE_ENTITY, CLIENT_STATE_LABEL, clientState } from '../client-display';

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
  styles: [`
    .client-card {
      position: relative;
      transition: translate 200ms, scale 200ms;
    }
    .client-card:hover { translate: 0 -0.25rem; scale: 1.02; }
    /* L'effet de survol passe sur le conteneur : on neutralise celui de la carte. Le pied
       de carte (Voir le dossier) n'apparaît qu'au survol ; hors survol, on réserve en bas
       la place de la pastille. */
    .client-card ::ng-deep .glass-card {
      height: 100%;
      translate: none !important;
      scale: none !important;
      padding-bottom: 2.25rem;
    }
    .client-card:hover ::ng-deep .glass-card { padding-bottom: 1.25rem; }
    .client-type {
      position: absolute;
      left: 1.25rem;
      bottom: 1rem;
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      padding: 0.25rem 0.625rem;
      border-radius: 9999px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      pointer-events: none;
      background: var(--color-surface-container);
      color: var(--color-on-surface-variant);
    }
    .client-type .material-symbols-outlined { font-size: 14px; }
    .client-type--group {
      background: color-mix(in srgb, var(--color-tertiary) 15%, transparent);
      color: var(--color-tertiary);
    }
  `],
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
          <!-- Le type de client (inter-company / third party) s'affiche en bas à gauche.
               daf-entity-card n'a pas d'emplacement pour ça : la pastille est posée
               par-dessus, dans un conteneur qui porte à sa place l'effet de survol de
               la carte, pour que les deux bougent ensemble. -->
          <div class="client-card">
            <daf-entity-card
              [options]="card.options"
              (cardClick)="open.emit(card.id)"
              (viewClick)="open.emit(card.id)" />
            <span class="client-type" [class.client-type--group]="card.group">
              <span class="material-symbols-outlined">{{ card.group ? 'hub' : 'handshake' }}</span>
              {{ card.typeLabel }}
            </span>
          </div>
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
  private readonly currencyContext = inject(CurrencyContextService);

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

  protected readonly cards = computed<{
    id: number; group: boolean; typeLabel: string; options: EntityCardOptions;
  }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.clients().map(c => ({
      id: c.id,
      group: c.clientType === 'INTER_COMPANY',
      typeLabel: t(c.clientType === 'INTER_COMPANY'
        ? 'CLIENTS.FORM.CLIENT_TYPE_INTER_COMPANY'
        : 'CLIENTS.FORM.CLIENT_TYPE_THIRD_PARTY'),
      options: {
        variant: 'glass',
        clickable: true,
        // Pas d'`image` : depuis la 4.16, une image omise ne dessine aucune pastille
        // d'avatar et le titre prend toute la largeur de la carte — exactement ce que
        // font les cartes d'affaires, avec lesquelles cette liste doit s'accorder.
        metadata: {
          title:    c.clientName,
          subtitle: [c.clientCode, c.sector ?? c.countryLabel].filter(Boolean).join(' · '),
          // The card has ONE status slot and the client carries two flags, so the
          // exception wins (UI-PLAYBOOK §6): inactive beats KYC. An active client
          // then splits on KYC — validated (green) vs awaiting (warning).
          status:      CLIENT_STATE_ENTITY[clientState(c)],
          statusLabel: t(CLIENT_STATE_LABEL[clientState(c)]),
        },
        metricsColumns: 2,
        metrics: [
          { label: t('CLIENTS.LIST.CARD.TOTAL_CA'),        value: this.currency.transform(c.totalCA, c.defaultCurrency ?? this.currencyContext.defaultCurrency() ?? 'EUR') },
          { label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'), value: String(c.activeAffaireCount) },
          { label: t('CLIENTS.LIST.CARD.PAYMENT_TERMS'),   value: c.paymentTermsDays != null ? `${c.paymentTermsDays} j` : '—' },
          { label: t('CLIENTS.LIST.CARD.COUNTRY'),         value: c.countryLabel ?? '—' },
        ],
        viewLabel: t('CLIENTS.LIST.CARD.SEE_FILE'),
      } satisfies EntityCardOptions,
    }));
  });
}


