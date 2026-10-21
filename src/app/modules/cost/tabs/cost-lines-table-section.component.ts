import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked, viewChild } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  BadgeCell, DafCellDirective, DataTableComponent, SortDirection, TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { CostInvoiceDto } from '../cost.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import { TableActionComponent } from '../../../shared/table-action.component';
import { tableTools } from '../../../shared/table-tools';
import {
  APPROVAL_BADGE_VARIANT, STATUS_BADGE_VARIANT, approvalLevelKey, formatDate, statusKey,
} from '../cost-display';
import {
  canEditInvoice, canReglementInvoice, canSubmitInvoice, invoiceCategorySummary,
} from './cost-invoice-display';

/** L'en-tête de tri tel que la page le garde — `null` = l'ordre du serveur. */
export interface CostInvoiceSort {
  key: string;
  dir: 'asc' | 'desc';
}
/** @deprecated nom d'avant V93 — gardé pour les appelants existants. */
export type CostLineSort = CostInvoiceSort;

/**
 * Colonne du tableau → champ de l'entité `CostInvoice` pour le tri serveur (`?sort=`, lu
 * par le `Pageable` de `GET /cost-invoices`).
 *
 * Pas de `supplier` (le nom d'un fournisseur lié n'est pas un champ de `CostInvoice`), ni
 * de `category` / `lines` (portés par les lignes) : ces colonnes ne se trient qu'en tri local.
 */
const SERVER_SORT_FIELD: Record<string, string> = {
  reference:     'reference',
  invoiceNumber: 'supplierInvoiceNumber',
  date:          'invoiceDate',
  net:           'netAmountLocal',
  ttc:           'grossAmountLocal',
  status:        'status',
  approval:      'approvalLevelRequired',
};

/**
 * List view of the cost tab — one row per cost INVOICE (V93), on the house table style
 * (UI-PLAYBOOK §6b): no wrapper and no outer card, `showHeader: false`, `emptyMessage`,
 * icon-only row actions.
 *
 * Deux modes de tri :
 * - `serverSort` (liste paginée côté serveur) : `manualSort`, seules les colonnes de
 *   `SERVER_SORT_FIELD` sont triables, l'en-tête émet `sortChange` et la page recharge la
 *   première page triée ;
 * - sinon (toutes les factures en une fois) : tri local de la lib, sur les valeurs brutes
 *   (`sortAccessor`) plutôt que sur les chaînes formatées.
 *
 * Stateless: invoices in, `(view)` / `(edit)` / `(submitInvoice)` / `(createReglement)` /
 * `(sortChange)` out.
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

      <ng-template dafCell="reference" let-row>
        <span class="font-mono text-[12px] font-semibold text-on-surface">{{ row['_reference'] }}</span>
      </ng-template>

      <ng-template dafCell="supplier" let-row>
        <span class="font-medium text-on-surface">{{ row['_supplier'] }}</span>
      </ng-template>

      <ng-template dafCell="description" let-row>
        <span class="block max-w-70 truncate text-on-surface" [attr.title]="row['_descriptionFull']">
          {{ row['_description'] }}
        </span>
        @if (row['_descriptionMore']) {
          <span class="text-[11px] text-on-surface-variant">+{{ row['_descriptionMore'] }}</span>
        }
      </ng-template>

      <ng-template dafCell="_actions" let-row>
        <div class="flex items-center justify-end gap-2">
          @if (row['_canSubmit']) {
            <fact-table-action icon="send" [tooltip]="tips().submit"
                               (action)="submitInvoice.emit(row['_raw'])" />
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

  invoices     = input.required<CostInvoiceDto[]>();
  loading      = input(false);
  emptyMessage = input('');
  pageSize     = input(25);
  /** Tri délégué au serveur — à activer quand `invoices` n'est qu'une page du résultat. */
  serverSort   = input(false);
  /** Le tri courant de la page — ressème la flèche quand le tableau est (re)créé. */
  sort         = input<CostInvoiceSort | null>(null);
  /** Colonne Fournisseur — à masquer sur la fiche d'un fournisseur, où elle est la même partout. */
  showSupplier    = input(true);
  /** Colonne Description : les libellés des lignes de la facture (premier + « +N »). */
  showDescription = input(false);

  /** Row click — the read-only invoice detail page. Editing stays on the pencil action. */
  readonly view            = output<CostInvoiceDto>();
  readonly edit            = output<CostInvoiceDto>();
  readonly submitInvoice   = output<CostInvoiceDto>();
  readonly createReglement = output<CostInvoiceDto>();
  /** Valeur `sort` à envoyer à l'API (`invoiceDate,desc`…), ou `null` quand le tri est retiré. */
  readonly sortChange      = output<{ sort: CostInvoiceSort | null; param: string | null }>();

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
    const raw = (row: TableRow) => row['_raw'] as CostInvoiceDto;
    const supplier: TableColumn[] = this.showSupplier()
      ? [{ key: 'supplier', label: t('COST.LINES.COL_SUPPLIER'), type: 'custom', sortable: sortable('supplier'),
           sortAccessor: row => (raw(row).supplierName ?? '').toLowerCase() }]
      : [];
    const description: TableColumn[] = this.showDescription()
      ? [{ key: 'description', label: t('COST.DETAIL.LINES.COL_DESCRIPTION'), type: 'custom', sortable: sortable('description'),
           sortAccessor: row => (row['_descriptionFull'] as string).toLowerCase() }]
      : [];
    return [
      { key: 'reference',     label: t('COST.LINES.COL_REFERENCE'),      type: 'custom', sortable: sortable('reference'),
        sortAccessor: row => raw(row).reference },
      ...supplier,
      { key: 'invoiceNumber', label: t('COST.LINES.COL_INVOICE_NUMBER'), type: 'text',   sortable: sortable('invoiceNumber') },
      ...description,
      { key: 'date',          label: t('COST.LINES.COL_INVOICE_DATE'),   type: 'text',   sortable: sortable('date'),
        sortAccessor: row => raw(row).invoiceDate },
      { key: 'lines',         label: t('COST.LINES.COL_LINES'),          type: 'text',   sortable: sortable('lines'),
        sortAccessor: row => raw(row).lines?.length ?? 0 },
      { key: 'category',      label: t('COST.LINES.COL_CATEGORY'),       type: 'text',   sortable: sortable('category') },
      { key: 'net',           label: t('COST.LINES.COL_NET_AMOUNT'),     type: 'text',   sortable: sortable('net'),
        sortAccessor: row => raw(row).netAmountLocal },
      { key: 'ttc',           label: t('COST.LINES.COL_TTC'),            type: 'text',   sortable: sortable('ttc'),
        sortAccessor: row => raw(row).grossAmountLocal },
      { key: 'status',        label: t('COST.LINES.COL_STATUS'),         type: 'badge',  sortable: sortable('status') },
      { key: 'approval',      label: t('COST.LINES.COL_APPROVAL'),       type: 'badge',  sortable: sortable('approval') },
      { key: '_actions',      label: '', width: '1%' },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() => {
    const lang = this.translate.currentLang();
    const t  = (key: string) => this.translate.instant(key);
    const tp = (key: string, params?: Record<string, unknown>) => this.translate.instant(key, params);

    return this.invoices().map(inv => {
      const levelKey = approvalLevelKey(inv.approvalLevelRequired);
      // Distinct line labels, in line order — an invoice often repeats one description.
      const labels = [...new Set((inv.lines ?? []).map(l => l.label?.trim()).filter((s): s is string => !!s))];
      return {
        _description:     labels[0] ?? '—',
        _descriptionMore: labels.length > 1 ? labels.length - 1 : 0,
        _descriptionFull: labels.join(' · '),
        id:            inv.id,
        invoiceNumber: inv.supplierInvoiceNumber ?? '—',
        date:          formatDate(inv.invoiceDate),
        lines:         String(inv.lines?.length ?? 0),
        category:      invoiceCategorySummary(inv, lang, tp),
        net:           this.currency.transform(inv.netAmountLocal, inv.currency ?? 'TND'),
        ttc:           this.currency.transform(inv.grossAmountLocal, inv.currency ?? 'TND'),
        status: {
          label:   t(statusKey(inv.status)),
          options: { variant: STATUS_BADGE_VARIANT[inv.status] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,
        approval: {
          label:   levelKey ? t(levelKey) : '—',
          options: {
            variant: APPROVAL_BADGE_VARIANT[inv.approvalLevelRequired ?? ''] ?? 'neutral',
            size: 'sm',
          },
        } satisfies BadgeCell,

        // Rendered by the projected cells above.
        _reference:    inv.reference ?? `#${inv.id}`,
        _supplier:     inv.supplierName ?? t('COST.LINES.NO_SUPPLIER_CARD'),
        _canEdit:      canEditInvoice(inv),
        _canSubmit:    canSubmitInvoice(inv),
        _canReglement: canReglementInvoice(inv),
        _raw:          inv,
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
    const sort: CostInvoiceSort | null = field && dir ? { key, dir } : null;
    this.sortChange.emit({ sort, param: sort ? `${field},${sort.dir}` : null });
  }

  protected onRowClick(row: TableRow): void {
    this.view.emit(row['_raw'] as CostInvoiceDto);
  }
}
