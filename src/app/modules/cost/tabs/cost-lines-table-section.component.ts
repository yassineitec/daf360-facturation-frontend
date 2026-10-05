import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked, viewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, SortDirection, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { CostLineDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import { tableTools } from '../../../shared/table-tools';
import {
  APPROVAL_BADGE_VARIANT, STATUS_BADGE_VARIANT, approvalLevelKey, canEdit, canReglement,
  canSubmit, formatDate, statusKey,
} from '../cost-display';

/** L'en-tête de tri tel que la page le garde — `null` = l'ordre du serveur. */
export interface CostLineSort {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * Colonne du tableau → champ de l'entité `CostLine` pour le tri serveur (`?sort=`, lu par
 * le `Pageable` de `GET /cost-lines`). La catégorie se trie sur le libellé affiché
 * (`costCategory.labelFr`) : Spring Data en fait une jointure externe, une ligne sans
 * catégorie reste donc dans la liste.
 */
// Pas de `supplier` : le nom d'un fournisseur lié n'est pas un champ de `CostLine`
// (seul supplierId l'est) — la colonne ne se trie qu'en tri local.
const SERVER_SORT_FIELD: Record<string, string> = {
  category: 'costCategory.labelFr',
  date:     'transactionDate',
  net:      'netAmountLocal',
  ttc:      'grossAmountLocal',
  status:   'status',
  approval: 'approvalLevelRequired',
};

/**
 * List view of the Lignes de coût tab on the house table style (UI-PLAYBOOK §6b): no
 * wrapper and no outer card, `showHeader: false`, `emptyMessage`, icon-only row actions.
 *
 * Outils de tableau de la lib activés, comme sur `/finance/affaires` (`tableTools`). Deux
 * modes de tri :
 * - `serverSort` (onglet Lignes de coût, paginé côté serveur) : `manualSort`, seules les
 *   colonnes de `SERVER_SORT_FIELD` sont triables, l'en-tête émet `sortChange` et la page
 *   recharge la première page triée ;
 * - sinon (fiche fournisseur, toutes les lignes en une fois) : tri local de la lib, sur
 *   les valeurs brutes (`sortAccessor`) plutôt que sur les chaînes formatées.
 *
 * Stateless: lines in, `(view)` / `(edit)` / `(submitLine)` / `(sortChange)` out.
 */
@Component({
  selector: 'app-cost-lines-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective, TableActionComponent],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)"
      (sortChange)="onSortChange($event.key, $event.dir)"
      (resetClick)="onSortChange('', null)">

      <!-- Supplier carries the line's reference as a second line rather than spending a
           whole column on it. -->
      <ng-template dafCell="supplier" let-row>
        <div class="flex flex-col leading-snug">
          <span class="font-medium text-on-surface">{{ row['_supplier'] }}</span>
          @if (row['_reference']) {
            <span class="font-mono text-[11px] text-outline">{{ row['_reference'] }}</span>
          }
        </div>
      </ng-template>

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (row['_canSubmit']) {
            <fact-table-action icon="send" [tooltip]="tips().submit"
                               (action)="submitLine.emit(row['_raw'])" />
          }
          @if (row['_canEdit']) {
            <fact-table-action id="edit" [tooltip]="tips().edit" (action)="edit.emit(row['_raw'])" />
          }
          @if (row['_canReglement']) {
            <fact-table-action icon="payments" [tooltip]="tips().reglement"
                               (action)="createReglement.emit(row['_raw'])" />
          }
        </div>
      </ng-template>

    </daf-data-table>
  `,
})
export class CostLinesTableSectionComponent {
  private readonly translate = inject(TranslateService);

  /** Le tableau rendu — la page le passe à `daf-search-toolbar` (`[table]`) pour placer
   *  réinitialiser + choix des colonnes à droite de Filtres, au lieu d'au-dessus de la carte. */
  readonly table = viewChild(DataTableComponent);
  private readonly currency  = inject(DisplayCurrencyPipe);

  lines        = input.required<CostLineDto[]>();
  categoryFor  = input.required<(line: CostLineDto) => string>();
  loading      = input(false);
  emptyMessage = input('');
  pageSize     = input(25);
  /** Tri délégué au serveur — à activer quand `lines` n'est qu'une page du résultat. */
  serverSort   = input(false);
  /** Le tri courant de la page — ressème la flèche quand le tableau est (re)créé. */
  sort         = input<CostLineSort | null>(null);

  /** Row click — the read-only detail page, same as a card click. Editing stays on the pencil action. */
  readonly view            = output<CostLineDto>();
  readonly edit            = output<CostLineDto>();
  readonly submitLine      = output<CostLineDto>();
  readonly createReglement = output<CostLineDto>();
  /** Valeur `sort` à envoyer à l'API (`label,asc`…), ou `null` quand le tri est retiré. */
  readonly sortChange      = output<{ sort: CostLineSort | null; param: string | null }>();

  protected readonly tips = computed(() => {
    this.translate.currentLang();
    return {
      edit:      this.translate.instant('COST.LINES.EDIT'),
      submit:    this.translate.instant('COST.LINES.SUBMIT'),
      reglement: this.translate.instant('COST.LINES.CREATE_REGLEMENT'),
    };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    // En tri serveur, seules les colonnes portées par l'entité ; en tri local, toutes.
    const sortable = (key: string) => !this.serverSort() || key in SERVER_SORT_FIELD;
    const raw = (row: TableRow) => row['_raw'] as CostLineDto;
    return [
      { key: 'supplier', label: t('COST.LINES.COL_SUPPLIER'),    type: 'custom', sortable: sortable('supplier'),
        sortAccessor: row => (raw(row).supplierName ?? '').toLowerCase() },
      { key: 'category', label: t('COST.LINES.COL_CATEGORY'),    type: 'text',   sortable: sortable('category') },
      { key: 'date',     label: t('COST.LINES.COL_DATE'),        type: 'text',   sortable: sortable('date'),
        sortAccessor: row => raw(row).transactionDate },
      { key: 'net',      label: t('COST.LINES.COL_NET_AMOUNT'),  type: 'text',   sortable: sortable('net'),
        sortAccessor: row => raw(row).netAmountLocal },
      { key: 'ttc',      label: t('COST.LINES.COL_TTC'),         type: 'text',   sortable: sortable('ttc'),
        sortAccessor: row => raw(row).grossAmountLocal },
      { key: 'status',   label: t('COST.LINES.COL_STATUS'),      type: 'badge',  sortable: sortable('status') },
      { key: 'approval', label: t('COST.LINES.COL_APPROVAL'),    type: 'badge',  sortable: sortable('approval') },
      { key: '_actions', label: '', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const cat = this.categoryFor();

    return this.lines().map(line => {
      const levelKey = approvalLevelKey(line.approvalLevelRequired);
      return {
        id:       line.id,
        category: cat(line),
        date:     formatDate(line.transactionDate),
        net:      this.currency.transform(line.netAmountLocal, line.currency ?? 'TND'),
        ttc:      this.currency.transform(line.grossAmountLocal, line.currency ?? 'TND'),
        status: {
          label:   t(statusKey(line.status)),
          options: { variant: STATUS_BADGE_VARIANT[line.status] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,
        approval: {
          label:   levelKey ? t(levelKey) : '—',
          options: {
            variant: APPROVAL_BADGE_VARIANT[line.approvalLevelRequired ?? ''] ?? 'neutral',
            size: 'sm',
          },
        } satisfies BadgeCell,

        // Rendered by the projected cells above.
        _supplier:   line.supplierName ?? t('COST.LINES.NO_SUPPLIER_CARD'),
        _reference:  line.reference ?? '',
        _canEdit:      canEdit(line),
        _canSubmit:    canSubmit(line),
        _canReglement: canReglement(line),
        _raw:          line,
      };
    });
  });

  protected readonly config = computed<TableConfig>(() => {
    this.translate.currentLang();
    // Graine lue une seule fois par le tableau — la suivre reconstruirait la config à chaque clic.
    const sort = untracked(this.sort);
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: Math.min(this.pageSize(), 20),
      emptyMessage: this.emptyMessage(),
      ...tableTools(this.translate),
      // Lignes rendues dans l'ordre renvoyé par l'API ; sortChange est tout de même émis.
      manualSort:   this.serverSort(),
      ...(sort ? { defaultSort: sort } : {}),
    };
  });

  /** Clic d'en-tête (ou bouton reset) → valeur `sort` pour l'API, ou `null` si retiré. */
  protected onSortChange(key: string, dir: SortDirection): void {
    if (!this.serverSort()) return;
    const field = SERVER_SORT_FIELD[key];
    const sort: CostLineSort | null = field && dir ? { key, dir } : null;
    this.sortChange.emit({ sort, param: sort ? `${field},${sort.dir}` : null });
  }

  protected onRowClick(row: TableRow): void {
    this.view.emit(row['_raw'] as CostLineDto);
  }
}
