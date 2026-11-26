import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  EntityCardComponent, EntityCardOptions, PaginationComponent, SkeletonComponent,
} from '@khalilrebhiitec/daf360';
import { CurrencyAmount, InvoiceAffaireGroup } from '../invoice.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/** L'affaire choisie sur une carte : la page filtre alors sa liste dessus. */
export interface AffairePick {
  id:    number;
  label: string;
}

interface AffaireCard {
  key:       string;
  affaireId: number | null;
  label:     string;
  options:   EntityCardOptions;
}

/**
 * Vue « Par affaire » de `/finance/invoicing` : une carte par affaire, avec le nombre de
 * factures, le total facturé, ce qui reste à encaisser et les retards. Un clic émet `pick` :
 * la page bascule alors en liste filtrée sur cette affaire (KPI, filtres, export et actions
 * rapides inclus) — pas de page dédiée, la fiche affaire a déjà son onglet Factures.
 *
 * Les affaires arrivent déjà agrégées par le serveur (GET /invoices/by-affaire, mêmes
 * filtres que la liste) ; seule la pagination des cartes se fait ici.
 */
@Component({
  selector: 'app-invoices-by-affaire-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, EntityCardComponent, PaginationComponent, SkeletonComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <div class="flex flex-col gap-5">
      <!-- Même grille 3 colonnes que les cartes de factures, d'affaires et de clients. -->
      <div class="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
        @if (loading()) {
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <daf-skeleton variant="block" radius="xl" width="100%" height="248px" />
          }
        } @else {
          @for (card of pagedCards(); track card.key) {
            <daf-entity-card
              [options]="card.options"
              (cardClick)="onPick(card)"
              (viewClick)="onPick(card)" />
          } @empty {
            <div class="col-span-full flex flex-col items-center gap-2 rounded-xl
                        border border-dashed border-outline-variant/50 px-6 py-14
                        text-center text-on-surface-variant">
              <span class="material-symbols-outlined text-[40px] text-outline-variant">work</span>
              <p class="text-body-md">{{ emptyMessage() }}</p>
            </div>
          }
        }
      </div>

      @if (!loading() && cards().length) {
        <daf-pagination
          [currentPage]="page()"
          [totalPages]="totalPages()"
          [totalElements]="cards().length"
          [pageSize]="pageSize()"
          [pageSizeOptions]="[9, 18, 36]"
          [perPageLabel]="'COMMON.PAGINATION.PER_PAGE' | translate"
          [summaryLabel]="'COMMON.PAGINATION.SUMMARY' | translate"
          [firstPageLabel]="'COMMON.PAGINATION.FIRST' | translate"
          [lastPageLabel]="'COMMON.PAGINATION.LAST' | translate"
          (pageChange)="page.set($event)"
          (pageSizeChange)="pageSize.set($event); page.set(0)" />
      }
    </div>
  `,
})
export class InvoicesByAffaireSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  groups       = input.required<InvoiceAffaireGroup[]>();
  loading      = input(false);
  emptyMessage = input('');

  readonly pick = output<AffairePick>();

  protected readonly page     = signal(0);
  protected readonly pageSize = signal(9);

  constructor() {
    // Nouveau jeu (recherche, filtres, pays) : retour à la première page.
    effect(() => { this.groups(); this.page.set(0); });
  }

  /** Une carte par affaire, dans l'ordre du serveur (référence, « Sans affaire » en dernier). */
  protected readonly cards = computed<AffaireCard[]>(() => {
    this.translate.currentLang();
    const t = (key: string, p?: object) => this.translate.instant(key, p);
    return this.groups().map(g => {
      const noAff = g.affaireId == null;
      const ref   = noAff ? t('INVOICING.LIST.BY_AFFAIRE.NO_AFFAIRE') : (g.affaireRef ?? `#${g.affaireId}`);
      return {
        key:       noAff ? 'none' : String(g.affaireId),
        affaireId: g.affaireId,
        label:     g.affaireIntitule ? `${ref} — ${g.affaireIntitule}` : ref,
        options: {
          variant:   'glass',
          clickable: !noAff,
          // Comme les cartes de la page Affaires : le nom de l'affaire en titre, la
          // référence (et le client) dessous.
          metadata: {
            title:       noAff ? ref : (g.affaireIntitule || ref),
            subtitle:    [noAff ? null : ref, g.clients.join(', ')].filter(Boolean).join(' · '),
            status:      g.overdueCount ? 'inactive' : 'active',
            statusLabel: g.overdueCount
              ? t('INVOICING.LIST.BY_AFFAIRE.OVERDUE', { count: g.overdueCount })
              : t('INVOICING.LIST.BY_AFFAIRE.UP_TO_DATE'),
          },
          metricsColumns: 2,
          metrics: [
            { label: t('INVOICING.LIST.BY_AFFAIRE.M_INVOICES'), value: String(g.invoiceCount) },
            { label: t('INVOICING.LIST.BY_AFFAIRE.M_BILLED'),   value: this.amounts(g.billed, g.billed) },
            { label: t('INVOICING.LIST.BY_AFFAIRE.M_OPEN'),     value: this.amounts(g.toCollect, g.billed) },
            { label: t('INVOICING.LIST.BY_AFFAIRE.M_OVERDUE'),  value: String(g.overdueCount) },
          ],
          viewLabel: noAff ? undefined : t('INVOICING.LIST.BY_AFFAIRE.VIEW'),
        } satisfies EntityCardOptions,
      };
    });
  });

  protected readonly totalPages = computed(() => Math.max(1, Math.ceil(this.cards().length / this.pageSize())));
  protected readonly pagedCards = computed(() => {
    const size = this.pageSize();
    const page = Math.min(this.page(), this.totalPages() - 1);
    return this.cards().slice(page * size, page * size + size);
  });

  protected onPick(card: AffaireCard): void {
    if (card.affaireId != null) this.pick.emit({ id: card.affaireId, label: card.label });
  }

  /** Montants par devise (une affaire n'en a presque toujours qu'une) ; « 0 » dans la devise facturée sinon. */
  private amounts(list: CurrencyAmount[], billed: CurrencyAmount[]): string {
    if (!list.length) return this.currency.transform(0, billed[0]?.currency);
    return list.map(a => this.currency.transform(a.amount, a.currency)).join(' · ');
  }
}
