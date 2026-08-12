import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { AffaireListItem } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { STATUT_ENTITY_STATUS, typeLabel } from '../affaire-display';

/**
 * Card view of `/finance/affaires` — one `daf-entity-card` per affaire.
 *
 * Stateless: affaires in, `(open)` out. The page owns the fetch, the filters and the
 * pagination (UI-PLAYBOOK §8b).
 */
@Component({
  selector: 'app-affaires-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <!-- Standard breakpoints, not an arbitrary min-[…] variant: these are also
         force-listed in styles.css's @source inline(), so the columns can never be
         dropped by the Tailwind scan and collapse the grid to one card per row.
         NB: never write a backtick inside this template literal (UI-PLAYBOOK §10f) —
         it ends the string and the errors surface on the class members instead. -->
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
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class AffairesCardsSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  affaires     = input.required<AffaireListItem[]>();
  /** Libellés des pays par id — résolus par la page, la section reste sans état (§8b). */
  paysLabels   = input<Map<number, string>>(new Map());
  loading      = input(false);
  emptyMessage = input('');
  /** Placeholder count while the first page of a re-fetch is in flight. */
  skeletonCount = input(6);

  readonly open = output<number>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  /**
   * Built in a computed rather than inline in the template so the options object is
   * memoised per data change instead of per change-detection cycle, and the label
   * translation lives in one place (UI-PLAYBOOK §6). `currentLang()` is read so the
   * cards re-translate on a language switch — `translate.instant` is not reactive.
   */
  protected readonly cards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.affaires().map(a => ({
      id: a.id,
      options: {
        variant: 'glass',
        clickable: true,
        // No `image`: since lib 4.16 an omitted image renders no avatar badge at all and
        // the title takes the full card width — which is what these cards want.
        metadata: {
          title: a.intitule,
          // Le pays rejoint le sous-titre plutôt que les indicateurs : `daf-entity-card`
          // n'a pas de emplacement à pastilles (seuls `title`, `subtitle` et la puce de
          // statut, déjà prise par le statut de l'affaire), et la carte doit rester à
          // QUATRE indicateurs. Le sous-titre est justement la ligne d'identification.
          subtitle: [a.reference, typeLabel(a.typeAffaire), this.paysLabels().get(a.paysId)]
            .filter(Boolean).join(' · '),
          status:      STATUT_ENTITY_STATUS[a.statut] ?? 'active',
          statusLabel: t(`AFFAIRES.LIST.TABLE.STATUS.${a.statut}`),
        },
        metricsColumns: 2,
        metrics: [
          { label: t('AFFAIRES.LIST.TABLE.CARD.CLIENT'),  value: a.clientName ?? '—' },
          { label: t('AFFAIRES.LIST.TABLE.CARD.MANAGER'), value: a.responsableFullName ?? '—' },
          { label: t('AFFAIRES.LIST.TABLE.CARD.BUDGET_LABEL'), value: this.currency.transform(a.budgetPrevisionnel, a.devise ?? 'TND') },
          { label: t('AFFAIRES.LIST.TABLE.HEADERS.RAF'),  value: this.currency.transform(a.rafDisponible, a.devise ?? 'TND') },
        ],
        viewLabel: t('AFFAIRES.LIST.TABLE.SEE_DETAIL'),
      } satisfies EntityCardOptions,
    }));
  });
}
