import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ButtonComponent, DataTableComponent, TableColumn, TableConfig, TableRow } from '@khalilrebhiitec/daf360';
import { DepenseLigne } from './depense.model';
import { isoWeek } from '../../../shared/iso-week';
import { tableTools } from '../../../shared/table-tools';
import { DisplayCurrencyPipe } from '../../../shared/display-currency.pipe';

/**
 * Drill-down for one collaborator out of a Dépense preview — a summary strip (hours, cost,
 * days worked) plus the full Date -> Discipline -> WBS -> Document breakdown. Adapted from
 * WipTmCollaboratorDetailComponent, keyed by email (always present) instead of userId (can
 * be null here for an unresolved Timesheet account).
 */
@Component({
  selector: 'app-depense-collaborator-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  standalone: true,
  imports: [DataTableComponent, ButtonComponent, TranslatePipe],
  providers: [DisplayCurrencyPipe],
  host: { class: 'block' },
  templateUrl: './depense-collaborator-detail.component.html',
})
export class DepenseCollaboratorDetailComponent {
  private readonly translate = inject(TranslateService);
  private readonly currency = inject(DisplayCurrencyPipe);

  lignes = input.required<DepenseLigne[]>();
  email = input.required<string>();
  devise = input.required<string>();
  back = output<void>();

  protected readonly rowsForUser = computed(() => this.lignes().filter(l => l.userEmail === this.email()));

  protected readonly userFullName = computed(() => this.rowsForUser()[0]?.userFullName ?? '');

  protected readonly summary = computed(() => {
    const rows = this.rowsForUser();
    const totalHours = rows.reduce((sum, l) => sum + l.hours, 0);
    const totalCost = rows.reduce((sum, l) => sum + l.costAmount, 0);
    const days = new Set(rows.map(l => l.date)).size;
    const documents = new Set(rows.map(l => l.document).filter(Boolean)).size;
    return { totalHours, totalCost, days, documents };
  });

  protected readonly columns = computed<TableColumn[]>(() => {
    this.translate.currentLang();
    const t = (key: string) => this.translate.instant(key);
    // Tri local (toutes les lignes du collaborateur, sans pagination), sur les valeurs
    // brutes : la date formatée et le montant formaté se trieraient mal en texte.
    const src = (row: TableRow) => row['_source'] as DepenseLigne;
    return [
      { key: 'date', label: t('AFFAIRES.WIP.COL_DATE'), type: 'text', sortable: true,
        sortAccessor: row => src(row).date },
      { key: 'week', label: t('AFFAIRES.WIP.COL_WEEK'), type: 'text', sortable: true,
        sortAccessor: row => src(row).date },
      { key: 'discipline', label: t('AFFAIRES.WIP.COL_DISCIPLINE'), type: 'text', sortable: true },
      { key: 'wbs', label: t('AFFAIRES.WIP.COL_WBS'), type: 'text', sortable: true },
      { key: 'document', label: t('AFFAIRES.WIP.COL_DOCUMENT'), type: 'text', sortable: true },
      { key: 'hours', label: t('AFFAIRES.WIP.COL_HOURS'), type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).hours },
      { key: 'cost', label: t('AFFAIRES.WIP.COL_COST'), type: 'text', align: 'right', sortable: true,
        sortAccessor: row => src(row).costAmount },
    ];
  });

  protected readonly rows = computed<TableRow[]>(() =>
    this.rowsForUser()
      .slice()
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l, i) => ({
        id: i,
        date: this.fmtDate(l.date),
        week: 'S' + isoWeek(l.date),
        discipline: l.disciplineLabel ?? '—',
        wbs: l.wbsName ?? l.wbsId ?? '—',
        document: l.document ?? '—',
        hours: l.hours.toFixed(2),
        cost: this.fmtAmt(l.costAmount),
        _source: l,
      })),
  );

  protected readonly config = computed<TableConfig>(() => ({
    showHeader: false,
    hoverable: true,
    emptyMessage: this.translate.instant('AFFAIRES.DEPENSE.EMPTY_DETAIL'),
    ...tableTools(this.translate),
  }));

  protected fmtDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  protected fmtAmt(v: number): string {
    return this.currency.transform(v, this.devise());
  }
}
