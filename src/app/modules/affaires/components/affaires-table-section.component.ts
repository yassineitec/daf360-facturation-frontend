import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { AffaireListItem } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  RAF_TONE_CLASS, STATUT_BADGE_VARIANT, distinctResponsables, initials, rafTone, typeLabel,
} from '../affaire-display';

/**
 * List view of `/finance/affaires` on the house table style (UI-PLAYBOOK §6b):
 * no wrapper and no outer card (the lib already draws the border, the radius and
 * its own `overflow-x-auto`), `showHeader: false` so the page keeps exactly one
 * `h1`, `emptyMessage` instead of a bespoke empty state, and a single icon-only
 * row action in a trailing right-aligned column.
 *
 * Stateless: affaires in, `(open)` / `(rowActivate)` out.
 */
@Component({
  selector: 'app-affaires-table-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, DafCellDirective],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  template: `
    <daf-data-table
      [columns]="columns()"
      [rows]="rows()"
      [config]="config()"
      (rowClick)="onRowClick($event)">

      <ng-template dafCell="raf" let-row>
        <span class="font-bold" [class]="row['_rafClass']">{{ row['_rafLabel'] }}</span>
      </ng-template>

    </daf-data-table>
  `,
})
export class AffairesTableSectionComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency  = inject(DisplayCurrencyPipe);

  affaires     = input.required<AffaireListItem[]>();
  loading      = input(false);
  emptyMessage = input('');
  /** Current page size — the skeleton draws that many rows, capped at 20 (§6b rule 7). */
  pageSize     = input(20);
  /**
   * Photos RH des responsables, par `userId`. La page les résout en un seul appel groupé
   * pour toute la page de résultats : la section reste sans état, elle ne fait que lire
   * (UI-PLAYBOOK §8b). Vide par défaut, donc la colonne affiche les initiales.
   */
  avatarUrls   = input<Map<number, string>>(new Map());
  /** Libellés des pays par id — le endpoint de liste ne renvoie que `paysId`. */
  paysLabels   = input<Map<number, string>>(new Map());

  /** A row click opens the affaire; the trailing `view` action means the same thing. */
  readonly open = output<number>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    return [
      { key: 'reference',   label: t('AFFAIRES.LIST.TABLE.HEADERS.REF'),     type: 'text'   },
      { key: 'intitule',    label: t('AFFAIRES.LIST.TABLE.HEADERS.TITLE'),   type: 'text'   },
      { key: 'client',      label: t('AFFAIRES.LIST.TABLE.HEADERS.CLIENT'),  type: 'text'   },
      { key: 'pays',        label: t('AFFAIRES.LIST.TABLE.HEADERS.PAYS'),    type: 'text'   },
      { key: 'responsable', label: t('AFFAIRES.LIST.TABLE.HEADERS.MANAGER'), type: 'avatar' },
      { key: 'type',        label: t('AFFAIRES.LIST.TABLE.HEADERS.TYPE'),    type: 'text'   },
      { key: 'budget',      label: t('AFFAIRES.LIST.TABLE.HEADERS.BUDGET'),  type: 'text', align: 'right' },
      { key: 'raf',         label: t('AFFAIRES.LIST.TABLE.HEADERS.RAF'),     type: 'custom', align: 'right' },
      { key: 'statut',      label: t('AFFAIRES.LIST.TABLE.HEADERS.STATUS'),  type: 'badge'  },
    ];
    // No column is `sortable`: the lib sorts client-side over the one page it was
    // handed, and the list is server-paginated — the arrows would silently reorder
    // just the visible rows (§10b).
  });

  protected readonly rows = computed<TableRow[]>(() => {
    this.translate.currentLang();
    return this.affaires().map(a => {
      const devise = a.devise ?? 'TND';
      // Les responsables de l'affaire, dédoublonnés par personne, principal en tête —
      // `affaire_responsables` porte une ligne par activité, pas par personne.
      const people = distinctResponsables(a);
      const lead   = people[0];
      return {
        id:          a.id,
        reference:   a.reference,
        intitule:    a.intitule,
        client:      a.clientName ?? '—',
        pays:        this.paysLabels().get(a.paysId) ?? '—',
        responsable: {
          name:     lead?.fullName ?? '—',
          initials: initials(lead?.fullName),
          // La photo RH du responsable. La cellule `avatar` de la lib affiche `avatar`
          // quand il est là et retombe sur `initials` sinon, donc une affaire dont le
          // responsable n'a pas de photo (ou pas de profil RH) reste correcte sans
          // traitement particulier ici.
          avatar:   lead ? this.avatarUrls().get(lead.userId) : undefined,
          // Le sous-titre portait le mode de facturation, une information sans rapport
          // avec la personne affichée juste au-dessus. Il porte maintenant le reste de
          // l'équipe : sans lui, la colonne laissait croire à un responsable unique.
          subtitle: people.length > 1
            ? this.translate.instant('AFFAIRES.LIST.TABLE.MANAGERS_OTHERS', { count: people.length - 1 })
            : undefined,
        } satisfies AvatarCell,
        type:      typeLabel(a.typeAffaire),
        budget:    this.currency.transform(a.budgetPrevisionnel, devise),
        statut:    {
          label:   this.translate.instant(`AFFAIRES.LIST.TABLE.STATUS.${a.statut}`),
          options: { variant: STATUT_BADGE_VARIANT[a.statut] ?? 'neutral', dot: true, size: 'sm' },
        } satisfies BadgeCell,
        // Rendered by the projected `raf` cell — the value needs a tone colour, which
        // a plain text column can't carry.
        _rafLabel: this.currency.transform(a.rafDisponible, devise),
        _rafClass: RAF_TONE_CLASS[rafTone(a)],
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
        tooltip: this.translate.instant('AFFAIRES.LIST.TABLE.SEE_DETAIL'),
        onClick: (row: TableRow) => this.open.emit(row['id'] as number),
      }],
    };
  });

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
