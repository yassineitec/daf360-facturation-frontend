import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ClientListItemDto } from '../client.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  CLIENT_STATE_BADGE, CLIENT_STATE_LABEL, clientState, initials,
} from '../client-display';

/**
 * Vue tableau de `/finance/clients`, sur le style maison (UI-PLAYBOOK §6b) et calquée
 * sur `app-affaires-table-section` : pas d'enveloppe ni de carte extérieure (la lib
 * dessine déjà bordure, rayon et défilement horizontal), `showHeader: false` pour que la
 * page garde un seul `h1`, `emptyMessage` plutôt qu'un état vide maison, et une action
 * de ligne unique, en icône, dans une colonne de fin alignée à droite.
 *
 * Sans état : des clients entrent, `(open)` sort. La page garde la charge des données,
 * des filtres et de la pagination (§8b).
 */
@Component({
  selector: 'app-clients-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)" />
  `,
})
export class ClientsTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  clients      = input.required<ClientListItemDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Taille de page courante — le squelette dessine autant de lignes, plafonné à 20. */
  pageSize     = input(20);

  readonly open = output<number>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'code',     label: t('CLIENTS.LIST.TABLE.CODE'),     type: 'text'   },
      { key: 'client',   label: t('CLIENTS.LIST.TABLE.NAME'),     type: 'avatar' },
      { key: 'pays',     label: t('CLIENTS.LIST.CARD.COUNTRY'),   type: 'text'   },
      { key: 'secteur',  label: t('CLIENTS.LIST.TABLE.SECTOR'),   type: 'text'   },
      { key: 'projets',  label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'), type: 'text', align: 'right' },
      { key: 'ca',       label: t('CLIENTS.LIST.CARD.TOTAL_CA'),  type: 'text', align: 'right' },
      { key: 'delai',    label: t('CLIENTS.LIST.CARD.PAYMENT_TERMS'), type: 'text', align: 'right' },
      { key: 'etat',     label: t('CLIENTS.LIST.TABLE.STATE'),    type: 'badge'  },
    ];
    // Aucune colonne triable : la lib trie côté client sur la seule page qu'on lui donne,
    // or la liste est paginée côté serveur — les flèches réordonneraient en silence les
    // seules lignes visibles (§10b). Même raison que pour la liste des affaires.
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.clients().map(c => {
      const state = clientState(c);
      return {
        id:      c.id,
        code:    c.clientCode,
        client:  {
          name:     c.clientName,
          initials: initials(c.clientName),
          subtitle: c.defaultCurrency ?? undefined,
        } satisfies AvatarCell,
        pays:    c.country ?? '—',
        secteur: c.sector ?? '—',
        projets: String(c.activeAffaireCount),
        ca:      this.currency.transform(c.totalCA, c.defaultCurrency ?? 'TND'),
        delai:   c.paymentTermsDays != null ? `${c.paymentTermsDays} j` : '—',
        etat: {
          label:   this.translate.instant(CLIENT_STATE_LABEL[state]),
          options: { variant: CLIENT_STATE_BADGE[state], dot: true, size: 'sm' },
        } satisfies BadgeCell,
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
      actions: [{
        id:      'view',
        tooltip: this.translate.instant('CLIENTS.LIST.CARD.SEE_FILE'),
        onClick: (row: TableRow) => this.open.emit(row['id'] as number),
      }],
    };
  });

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
