import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { SupplierDto, supplierTypeLabel } from '../supplier.model';import {
  SUPPLIER_STATE_BADGE, SUPPLIER_STATE_LABEL, initials, supplierCode, supplierState,
} from '../supplier-display';
import { TableSort, delegatedSort, tableTools, toTableSort } from '../../../shared/table-tools';

/**
 * Vue liste de `/finance/suppliers`, sur le style de table maison (UI-PLAYBOOK §6b) :
 * pas d'enveloppe ni de carte extérieure, `showHeader: false`, `emptyMessage`, et une
 * seule action de ligne en icône dans une colonne finale alignée à droite.
 *
 * Sans état : les fournisseurs entrent, `(open)` sort.
 */
@Component({
  selector: 'app-suppliers-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)"
      (sortChange)="sortChange.emit(toTableSort($event))"
      (resetClick)="sortChange.emit(null)">

      <ng-template dafCell="bank" let-row>
        @if (row['_iban']) {
          <span class="font-mono text-[12px] text-on-surface-variant">{{ row['_iban'] }}</span>
        } @else {
          <span class="text-[12px] text-outline">—</span>
        }
      </ng-template>

    </daf-data-table>
  `,
})
export class SuppliersTableSectionComponent {
  private readonly translate = inject(TranslateService);

  suppliers    = input.required<SupplierDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Taille de page courante — le squelette dessine autant de lignes, plafonné à 20 (§6b règle 7). */
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
      { key: 'supplier', label: t('SUPPLIERS.LIST.TABLE.NAME'),    type: 'avatar', sortable: true },
      { key: 'pays',     label: t('SUPPLIERS.LIST.TABLE.COUNTRY'), type: 'text',   sortable: true },
      { key: 'type',     label: t('SUPPLIERS.LIST.TABLE.TYPE'),    type: 'text',   sortable: true },
      { key: 'tva',      label: t('SUPPLIERS.LIST.TABLE.TVA'),     type: 'text',   sortable: true },
      { key: 'bank',     label: t('SUPPLIERS.LIST.TABLE.IBAN'),    type: 'custom', sortable: true },
      { key: 'statut',   label: t('SUPPLIERS.LIST.TABLE.STATUS'),  type: 'badge',  sortable: true },
    ];
    // Toutes triables, par le serveur (`manualSort`) : la liste est paginée côté serveur,
    // la clé de colonne part en `?sort=` et `SupplierService.SORT_COLUMNS` la traduit.
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);

    return this.suppliers().map(s => {
      const state = supplierState(s);
      return {
        id: s.id,
        // Le code du fournisseur passe en sous-titre de la cellule d'identité : il vivait
        // dans une colonne à lui, en `font-mono`, pour une valeur qui ne se lit jamais
        // sans le nom qu'elle désigne.
        supplier: {
          name:     s.name,
          initials: initials(s.name),
          subtitle: supplierCode(s),
        } satisfies AvatarCell,
        pays: s.paysLabel ?? '—',
        type: supplierTypeLabel(s, this.translate.currentLang()) ?? '—',
        tva:  s.numeroTva ?? '—',
        statut: {
          label:   t(SUPPLIER_STATE_LABEL[state]),
          options: { variant: SUPPLIER_STATE_BADGE[state], dot: true, size: 'sm' },
        } satisfies BadgeCell,

        // Rendue par la cellule projetée ci-dessus.
        _iban: s.iban ?? '',
        _raw:  s,
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
      // Inconditionnelle, donc sur `config.actions` plutôt qu'en cellule projetée — la
      // cellule d'actions de la lib arrête déjà la propagation (§6b règle 4).
      actions: [{
        id:      'view',
        tooltip: this.translate.instant('SUPPLIERS.LIST.TABLE.VIEW'),
        onClick: (row: TableRow) => this.open.emit(row['id'] as number),
      }],
    };
  });

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
