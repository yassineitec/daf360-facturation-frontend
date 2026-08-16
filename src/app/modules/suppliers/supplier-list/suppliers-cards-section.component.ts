import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { EntityCardComponent, EntityCardOptions, SkeletonComponent } from '@khalilrebhiitec/daf360';
import { SupplierDto } from '../supplier.model';
import {
  SUPPLIER_STATE_ENTITY, SUPPLIER_STATE_LABEL, supplierCode, supplierState,
} from '../supplier-display';

/**
 * Vue cartes de `/finance/suppliers` — un `daf-entity-card` par fournisseur.
 *
 * Sans état : les fournisseurs entrent, `(open)` sort. La page garde la requête, la
 * recherche et la pagination (UI-PLAYBOOK §8b). Calquée sur les sections clients et
 * impayés — même grille, même squelette, même état vide — pour que les listes finance se
 * lisent comme une seule famille.
 *
 * Elle remplace la liste mobile maison (`.mob-list` / `.mob-row`) qui redessinait chaque
 * fournisseur dans un second balisage, avec ses propres couleurs de statut, uniquement
 * sous 640 px.
 */
@Component({
  selector: 'app-suppliers-cards-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EntityCardComponent, SkeletonComponent],
  host: { class: 'block' },
  template: `
    <!-- Même grille plate à 3 colonnes que les autres sections de cartes finance. NB :
         jamais d'accent grave dans ce littéral de gabarit (UI-PLAYBOOK §10f). -->
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
            <span class="material-symbols-outlined text-[40px] text-outline-variant">storefront</span>
            <p class="text-body-md">{{ emptyMessage() }}</p>
          </div>
        }
      }

    </div>
  `,
})
export class SuppliersCardsSectionComponent {
  private readonly translate = inject(TranslateService);

  suppliers    = input.required<SupplierDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Nombre de gabarits pendant qu'une nouvelle requête est en vol. */
  skeletonCount = input(6);

  readonly open = output<number>();

  protected readonly skeletonSlots = computed(() =>
    Array.from({ length: Math.max(1, this.skeletonCount()) }, (_, i) => i),
  );

  protected readonly cards = computed<{ id: number; options: EntityCardOptions }[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.suppliers().map(s => {
      const state = supplierState(s);
      return {
        id: s.id,
        options: {
          variant: 'glass',
          clickable: true,
          // Pas d'`image` : comme les cartes clients et affaires, le titre prend toute
          // la largeur. Une pastille d'initiales n'apporterait rien qu'un fournisseur
          // n'ait déjà dans son nom.
          metadata: {
            title:       s.name,
            subtitle:    [supplierCode(s), s.paysLabel ?? s.paysCode].filter(Boolean).join(' · '),
            status:      SUPPLIER_STATE_ENTITY[state],
            statusLabel: t(SUPPLIER_STATE_LABEL[state]),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('SUPPLIERS.LIST.CARD.COUNTRY'), value: s.paysLabel ?? s.paysCode ?? '—' },
            { label: t('SUPPLIERS.LIST.CARD.TVA'),     value: s.numeroTva ?? '—' },
            { label: t('SUPPLIERS.LIST.CARD.IBAN'),    value: s.ibanMasked ?? t('SUPPLIERS.LIST.CARD.NO_IBAN') },
            { label: t('SUPPLIERS.LIST.CARD.TAX_ID'),  value: s.taxId ?? '—' },
          ],
          viewLabel: t('SUPPLIERS.LIST.CARD.SEE_FILE'),
        } satisfies EntityCardOptions,
      };
    });
  });
}
