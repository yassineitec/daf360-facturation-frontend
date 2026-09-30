import { ChangeDetectionStrategy, Component, computed, inject, input, output, untracked } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import {
  AvatarCell, BadgeCell, DafCellDirective, DataTableComponent, SortDirection,
  TableColumn, TableConfig, TableRow,
} from '@khalilrebhiitec/daf360';
import { AffaireListItem } from '../affaire.model';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';
import {
  BILLING_MODE_BADGE_VARIANT, RAF_TONE_CLASS, STATUT_BADGE_VARIANT,
  distinctResponsables, initials, rafTone, typeLabel,
} from '../affaire-display';
import { enumLabel } from '../../../shared/enum-labels';

/** L'en-tête de tri tel que la page le garde — `null` = l'ordre du serveur. */
export interface AffaireSort {
  key: string;
  dir: 'asc' | 'desc';
}

/**
 * Colonne du tableau → champ de l'entité `Affaire` pour le tri serveur (`?sort=`, lu par le
 * `Pageable` de `GET /affaires`). Seuls les champs portés par l'entité sont triables : le
 * client, le pays (libellé), le responsable et le RAF viennent d'autres tables ou sont
 * calculés, la base ne peut pas les ordonner. Le budget se trie sur le montant brut, sans
 * conversion de devise.
 */
const SERVER_SORT_FIELD: Record<string, string> = {
  reference:   'reference',
  intitule:    'intitule',
  billingMode: 'billingMode',
  budget:      'budgetPrevisionnel',
  statut:      'statut',
};

/**
 * List view of `/finance/affaires` on the house table style (UI-PLAYBOOK §6b):
 * no wrapper and no outer card (the lib already draws the border, the radius and
 * its own `overflow-x-auto`), `showHeader: false` so the page keeps exactly one
 * `h1`, `emptyMessage` instead of a bespoke empty state, and a single icon-only
 * row action in a trailing right-aligned column.
 *
 * Outils de tableau de la lib activés, comme sur les tableaux RH et pointage : en-têtes
 * triables, colonnes et lignes redimensionnables, choix des colonnes, bouton de
 * réinitialisation. **Tri serveur (`manualSort`)** : la liste est paginée côté serveur,
 * un tri local ne réordonnerait que la page affichée — l'en-tête émet `sortChange` et la
 * page recharge la première page triée (`sort` revient en `defaultSort` pour garder la
 * flèche après un aller-retour cartes ↔ liste).
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
      (rowClick)="onRowClick($event)"
      (sortChange)="onSortChange($event.key, $event.dir)"
      (resetClick)="onSortChange('', null)">

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
  /** Le tri courant de la page — ressème la flèche quand le tableau est (re)créé. */
  sort         = input<AffaireSort | null>(null);

  /** A row click opens the affaire; the trailing `view` action means the same thing. */
  readonly open = output<number>();
  /** Valeur `sort` à envoyer à l'API (`reference,asc`…), ou `null` quand le tri est retiré. */
  readonly sortChange = output<{ sort: AffaireSort | null; param: string | null }>();

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    const sortable = (key: string) => key in SERVER_SORT_FIELD;
    return [
      { key: 'reference',   label: t('AFFAIRES.LIST.TABLE.HEADERS.REF'),     type: 'text', sortable: sortable('reference') },
      { key: 'intitule',    label: t('AFFAIRES.LIST.TABLE.HEADERS.TITLE'),   type: 'text', sortable: sortable('intitule') },
      // Le mode se range avec la référence et l'intitulé, pas à côté du statut : ce sont
      // les trois éléments qui identifient le contrat, et deux pastilles voisines se
      // liraient comme un seul bloc d'état.
      { key: 'billingMode', label: t('AFFAIRES.LIST.TABLE.HEADERS.BILLING_MODE'), type: 'badge', sortable: sortable('billingMode') },
      { key: 'client',      label: t('AFFAIRES.LIST.TABLE.HEADERS.CLIENT'),  type: 'text'   },
      { key: 'pays',        label: t('AFFAIRES.LIST.TABLE.HEADERS.PAYS'),    type: 'text'   },
      { key: 'responsable', label: t('AFFAIRES.LIST.TABLE.HEADERS.MANAGER'), type: 'avatar' },
      { key: 'budget',      label: t('AFFAIRES.LIST.TABLE.HEADERS.BUDGET'),  type: 'text', align: 'right', sortable: sortable('budget') },
      { key: 'raf',         label: t('AFFAIRES.LIST.TABLE.HEADERS.RAF'),     type: 'custom', align: 'right' },
      { key: 'statut',      label: t('AFFAIRES.LIST.TABLE.HEADERS.STATUS'),  type: 'badge', sortable: sortable('statut') },
    ];
    // Tri serveur (`manualSort`) : la liste est paginée côté serveur, la lib ne trie donc
    // pas elle-même — elle aurait seulement réordonné les lignes visibles (§10b).
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
        // Une chaîne nue plutôt qu'une pastille vide quand le mode manque : la cellule
        // `badge` retombe sur le rendu texte dès que la valeur n'est pas un `BadgeCell`,
        // et une pastille contenant « — » est un cadre autour de rien. Le cas existe —
        // un brouillon peut être créé avant le choix du mode.
        billingMode: a.billingMode
          ? {
              label:   enumLabel(this.translate, 'BILLING_MODE', a.billingMode),
              options: {
                variant: BILLING_MODE_BADGE_VARIANT[a.billingMode] ?? 'neutral',
                size:    'sm',
                outline: true,
              },
            } satisfies BadgeCell
          : '—',
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
    const t = (key: string) => this.translate.instant(key);
    // Graine lue une seule fois par le tableau — la suivre reconstruirait la config à chaque clic.
    const sort = untracked(this.sort);
    return {
      showHeader:   false,
      hoverable:    true,
      loading:      this.loading(),
      skeletonRows: Math.min(this.pageSize(), 20),
      emptyMessage: this.emptyMessage(),
      // Identité stable des lignes : hauteurs et tri s'y rattachent, pas à l'index d'affichage.
      rowId:             (row: TableRow) => row['id'] as number,
      resizableColumns:  true,
      resizableRows:     true,
      columnPicker:      true,
      columnPickerLabel: t('COMMON.TABLE.COLUMN_PICKER'),
      showReset:         true,
      resetLabel:        t('COMMON.TABLE.RESET'),
      sortLabel:         t('COMMON.TABLE.SORT_BY'),
      // Lignes rendues dans l'ordre renvoyé par l'API ; sortChange est tout de même émis.
      manualSort:        true,
      ...(sort ? { defaultSort: sort } : {}),
      actions: [{
        id:      'view',
        tooltip: this.translate.instant('AFFAIRES.LIST.TABLE.SEE_DETAIL'),
        onClick: (row: TableRow) => this.open.emit(row['id'] as number),
      }],
    };
  });

  /** Clic d'en-tête (ou bouton reset) → valeur `sort` pour l'API, ou `null` si retiré. */
  protected onSortChange(key: string, dir: SortDirection): void {
    const field = SERVER_SORT_FIELD[key];
    const sort: AffaireSort | null = field && dir ? { key, dir } : null;
    this.sortChange.emit({ sort, param: sort ? `${field},${sort.dir}` : null });
  }

  protected onRowClick(row: TableRow): void {
    this.open.emit(row['id'] as number);
  }
}
