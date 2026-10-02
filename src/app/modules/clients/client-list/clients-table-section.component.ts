import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { ClientListItemDto } from '../client.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  CLIENT_STATE_BADGE, CLIENT_STATE_LABEL, clientLocation, clientState, initials,
} from '../client-display';
import { TableSort, delegatedSort, tableTools, toTableSort } from '../../../shared/table-tools';

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
      (rowClick)="onRowClick($event)"
      (sortChange)="sortChange.emit(toTableSort($event))"
      (resetClick)="sortChange.emit(null)" />
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
  /** Le tri courant de la page — ressème la flèche quand le tableau est (re)créé. */
  sort         = input<TableSort | null>(null);

  readonly open = output<number>();
  /** Nouveau tri d'en-tête (clé de colonne), ou `null` quand il est retiré. */
  readonly sortChange = output<TableSort | null>();

  protected readonly toTableSort = toTableSort;

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'code',     label: t('CLIENTS.LIST.TABLE.CODE'),     type: 'text',   sortable: true },
      { key: 'client',   label: t('CLIENTS.LIST.TABLE.NAME'),     type: 'avatar', sortable: true },
      { key: 'pays',     label: t('CLIENTS.LIST.CARD.COUNTRY'),   type: 'text',   sortable: true },
      { key: 'adresse',  label: t('CLIENTS.LIST.TABLE.ADDRESS'),  type: 'text',   sortable: true },
      { key: 'secteur',  label: t('CLIENTS.LIST.TABLE.SECTOR'),   type: 'text',   sortable: true },
      { key: 'projets',  label: t('CLIENTS.LIST.CARD.ACTIVE_PROJECTS'), type: 'text', align: 'right', sortable: true },
      { key: 'ca',       label: t('CLIENTS.LIST.CARD.TOTAL_CA'),  type: 'text', align: 'right', sortable: true },
      { key: 'delai',    label: t('CLIENTS.LIST.CARD.PAYMENT_TERMS'), type: 'text', align: 'right', sortable: true },
      { key: 'etat',     label: t('CLIENTS.LIST.TABLE.STATE'),    type: 'badge',  sortable: true },
    ];
    // Toutes triables, par le serveur (`manualSort`) : la liste est paginée côté serveur,
    // la clé de colonne part en `?sort=` et `ClientService.SORT_COLUMNS` la traduit.
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
        pays:    c.countryLabel ?? '—',
        adresse: clientLocation(c),
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
      ...tableTools(this.translate),
      ...delegatedSort(untracked(this.sort)),
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
